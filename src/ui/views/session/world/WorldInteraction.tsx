/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { GroupCall, Room, RoomStatus, Session } from "@thirdroom/hydrogen-view-sdk";
import { useSetAtom } from "jotai";
import { useCallback, useState } from "react";

import { InteractableType } from "../../../../engine/resource/schema";
import { InteractableAction } from "../../../../plugins/interaction/interaction.common";
import { useIsMounted } from "../../../hooks/useIsMounted";
import { useMainThreadContext } from "../../../hooks/useMainThread";
import { useMemoizedState } from "../../../hooks/useMemoizedState";
import { useLocalStorage } from "../../../hooks/useLocalStorage";
import { overlayWorldAtom } from "../../../state/overlayWorld";
import { aliasToRoomId, getMxIdUsername, parseMatrixUri } from "../../../utils/matrixUtils";
import { InteractionState, useWorldInteraction } from "../../../hooks/useWorldInteraction";
import { Dialog } from "../../../atoms/dialog/Dialog";
import { EntityTooltip, IPortalProcess } from "../entity-tooltip/EntityTooltip";
import { MemberListDialog } from "../dialogs/MemberListDialog";
import { getModule } from "../../../../engine/module/module.common";
import { CameraRigModule } from "../../../../plugins/camera/CameraRig.main";
import { Reticle } from "../reticle/Reticle";
import { useWorldNavigator } from "../../../hooks/useWorldNavigator";
import { useWorldLoader } from "../../../hooks/useWorldLoader";

const VERIFIER_API = 'https://thirdroom-gid-1a76fe926376.herokuapp.com'

interface WorldInteractionProps {
  session: Session;
  world: Room;
  activeCall?: GroupCall;
}

export function WorldInteraction({ session, world, activeCall }: WorldInteractionProps) {
  const mainThread = useMainThreadContext();
  const camRigModule = getModule(mainThread, CameraRigModule);

  const [activeEntity, setActiveEntity] = useMemoizedState<InteractionState | undefined>();
  const [portalProcess, setPortalProcess] = useMemoizedState<IPortalProcess>({});
  const [members, setMembers] = useState(false);

  const { navigateEnterWorld } = useWorldNavigator(session);
  const { exitWorld } = useWorldLoader();
  const selectWorld = useSetAtom(overlayWorldAtom);
  const isMounted = useIsMounted();
  const [gidAccount] = useLocalStorage<{sub: string, globalid: string}>('gid_account', {sub: '123', globalid: 'foo'})

  const [tooltipMsgs, setTooltipMsgs] = useState<Record<string, string|undefined>>({})


  const handlePortalGrab = useCallback(
    async (interaction) => {

      const handleGiDPortal = async (roomNameActual: string): Promise<boolean> => {
        setPortalProcess({
          hasRequirements: {
            checking: true,
            msg: 'Bitte warten..',
          }
        })

        const roomName = encodeURIComponent(roomNameActual)

        const accessResponse = await fetch(`${VERIFIER_API}/room_access?gid_uuid=${gidAccount.sub}&room=${roomName}`)
        const hasAccess = await accessResponse.json() as { hasAccess: boolean }

        console.log('gid: user has access to %o: %O', roomName, hasAccess)

        if (hasAccess.hasAccess === true) {
          return true
        }

        const accResponse = await fetch(`${VERIFIER_API}/proof?gid_uuid=${gidAccount.sub}&room=${roomName}`)

        if (accResponse.status !== 200) {
          setPortalProcess({
            hasRequirements: {
              checking: false,
              msg: 'Sorry our Demo backend is on vacation.',
            }
          })

        } else {
          setPortalProcess({
            hasRequirements: {
              checking: true,
              msg: 'Open your GiD app and approve proof request',
            }
          })
        }

        return false
      }

      let unSubStatusObserver: () => void | undefined;

      try {
        setPortalProcess({});

        const { uri, name } = interaction;

        if (!uri) throw Error("Portal does not have valid matrix id/alias");

        if (await handleGiDPortal(name) === false) {
          return
        }

        const parsedUri = parseMatrixUri(uri);
        if (parsedUri instanceof URL) {
          window.location.href = parsedUri.href;
          return;
        }

        const roomIdOrAlias = parsedUri.mxid1;
        const roomId = roomIdOrAlias.startsWith("#") ? aliasToRoomId(session.rooms, parsedUri.mxid1) : parsedUri.mxid1;

        if (!roomId) {
          setPortalProcess({ joining: true });
          const rId = await session.joinRoom(roomIdOrAlias);
          if (!isMounted()) return;

          setPortalProcess({});
          const roomStatusObserver = await session.observeRoomStatus(rId);
          unSubStatusObserver = roomStatusObserver.subscribe(async (roomStatus) => {
            const newWorld = session.rooms.get(rId);
            if (!newWorld || roomStatus !== RoomStatus.Joined) return;

            const stateEvent = await newWorld.getStateEvent("org.matrix.msc3815.world");
            const content = stateEvent?.event.content;
            if (!content) return;

            selectWorld(roomId);

            exitWorld();
            navigateEnterWorld(newWorld);
          });

          return;
        }

        const newWorld = session.rooms.get(roomId);
        if (newWorld) {
          const stateEvent = await newWorld.getStateEvent("org.matrix.msc3815.world");
          const content = stateEvent?.event.content;
          if (!content) return;

          selectWorld(roomId);

          exitWorld();
          navigateEnterWorld(newWorld);
          return;
        }
      } catch (err) {
        if (!isMounted()) return;
        setPortalProcess({ error: err as Error });
      }
      return () => {
        unSubStatusObserver?.();
      };
    },
    [session, selectWorld, exitWorld, navigateEnterWorld, isMounted, setPortalProcess, gidAccount.sub]
  );

  const handleInteraction = useCallback(
    (interaction?: InteractionState) => {


      async function enterTheCar(carName: string) {
        console.log('gid: enter the car %o', carName)
        tooltipMsgs[carName] = 'Requesting access to the car'
        setTooltipMsgs({ ...tooltipMsgs })

        await fetch(`${VERIFIER_API}/proof?gid_uuid=${gidAccount.sub}&room=${encodeURIComponent('#car:globalid.dev')}`)
        tooltipMsgs[carName] = `Check your phone for offer or proof..`
        setTooltipMsgs({ ...tooltipMsgs })

        console.log('gid: car access requested', carName)

        setTimeout(() => {
          tooltipMsgs[carName] = undefined
          setTooltipMsgs({ ...tooltipMsgs })
        }, 2000)
      }

      async function giveUserACookie(peerId: string, interaction: InteractionState) {
        const peerStorageKey = `gid_peer_${peerId}`
        const userInfoStr = localStorage.getItem(peerStorageKey) as string | null
        let userInfo: { gid_name: string, gid_uuid: string } | null = null

        if (userInfoStr != null) {
          userInfo = JSON.parse(userInfoStr) as { gid_name: string, gid_uuid: string }
        } else {
            const userGidUuid = (peerId as string).split(/@|:/g)[1]
          const response = await fetch(`https://api.globalid.dev/v1/identities/${userGidUuid}`)
          userInfo = await response.json()
          localStorage.setItem(peerStorageKey, JSON.stringify(userInfo))
        }

        console.log('gid: issuing cookie to %o', userInfo, activeEntity)

        tooltipMsgs[peerId] = `Offering ${userInfo!.gid_name} a cookie`
        setTooltipMsgs({ ...tooltipMsgs })

        const resp = await fetch(`${VERIFIER_API}/issue?gid_name=${gidAccount.globalid}&gid_uuid=${gidAccount.sub}&other_gid_uuid=${userInfo?.gid_uuid}`)

        console.log('gid: issued cookie %o', resp.status)

        tooltipMsgs[peerId] = `Cookie offered to ${userInfo!.gid_name}`
        setTooltipMsgs({ ...tooltipMsgs })

        setTimeout(() => {
          tooltipMsgs[peerId] = undefined
          setTooltipMsgs({ ...tooltipMsgs })
        }, 2000)
      }


      if (!interaction) return setActiveEntity(undefined);
      const { interactableType, action, peerId, name } = interaction;

      if (action === InteractableAction.Interact && name.includes('SM_car')) {
        enterTheCar(name)
      } else if (action === InteractableAction.Grab) {
        if (interactableType === InteractableType.Player && typeof peerId === "string") {
          console.log('gid: giving cookie instead of displaying member info')
          giveUserACookie(peerId, interaction)
          //setMembers(true);
          //document.exitPointerLock();
          return;
        }
        if (interactableType === InteractableType.Portal) {
          handlePortalGrab(interaction);
          return;
        }
      }

      if (interactableType === InteractableType.Player) {
        const entity: InteractionState = {
          ...interaction,
          name: peerId ? activeCall?.members.get(peerId)?.member.displayName || getMxIdUsername(peerId) : "Player",
        };
        setActiveEntity(entity);
      }

      setActiveEntity(interaction);
    },
    [handlePortalGrab, setActiveEntity, activeCall, tooltipMsgs, activeEntity, gidAccount.sub, gidAccount.globalid]
  );

  useWorldInteraction(mainThread, handleInteraction);

  const showTooltip = activeEntity && !camRigModule.orbiting
  let tooltipMsg: string | undefined = undefined

  if (activeEntity && activeEntity.interactableType === InteractableType.Player) {
    tooltipMsg = tooltipMsgs[activeEntity.peerId!]
  } else if (activeEntity && activeEntity.interactableType === InteractableType.Interactable) {
    tooltipMsg = tooltipMsgs[activeEntity.name]
  }


  return (
    <div>
      {!("isBeingCreated" in world) && (
        <Dialog open={members} onOpenChange={setMembers}>
          <MemberListDialog room={world} requestClose={() => setMembers(false)} />
        </Dialog>
      )}
      {!camRigModule.orbiting && <Reticle />}
      {showTooltip && (
        <EntityTooltip activeEntity={activeEntity} portalProcess={portalProcess} tooltipMsg={tooltipMsg} />
      )}
    </div>
  );
}
