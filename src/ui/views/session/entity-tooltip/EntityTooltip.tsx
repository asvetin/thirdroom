/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable camelcase */
import classnames from 'classnames'

import MouseIC from "../../../../../res/ic/mouse-left.svg";
import { InteractableType } from "../../../../engine/resource/schema";
import { Icon } from "../../../atoms/icon/Icon";
import { Dots } from "../../../atoms/loading/Dots";
import { Text } from "../../../atoms/text/Text";
import { InteractionState } from "../../../hooks/useWorldInteraction";
import { useLocalStorage } from "../../../hooks/useLocalStorage";
import "./EntityTooltip.css";

export interface IPortalProcess {
  joining?: boolean;
  error?: Error;
  hasRequirements?: {
    checking: boolean
    msg: string
  };
}

interface EntityTooltipProps {
  activeEntity: InteractionState;
  portalProcess: IPortalProcess;
  tooltipMsg?: string
}

interface GidAccountI {
  globalid: string
}

interface GidPeerUserI {
  gid_uuid: string
  gid_name: string
  display_image_url: string | null
}

export function EntityTooltip({ activeEntity, portalProcess, tooltipMsg }: EntityTooltipProps) {

  const [gidAccount] = useLocalStorage<GidAccountI>('gid_account', { globalid: 'mista minista' })

  // do not care - if not peer then we'll just be using foo data
  const isUser = activeEntity.interactableType === InteractableType.Player
  const peerId = isUser ? activeEntity.peerId : 'not_a_user'
  const peerStorageKey = `gid_peer_${peerId}`

  const [gidPeerUser, setGidPeerUser] = useLocalStorage<GidPeerUserI | null>(peerStorageKey, null)

  if (isUser && gidPeerUser == null) {
    const userGidUuid = (peerId as string).split(/@|:/g)[1]
    fetch(`https://api.globalid.dev/v1/identities/${userGidUuid}`)
      .then(async response => {
        const info = await response.json()
        setGidPeerUser(info)
      })
      .catch(e => {
        console.error('gid: some error fetching peer user info', e)
      })
  }

  return (
    <div className="EntityTooltip">
      {activeEntity.interactableType === InteractableType.Player && (
        <>
          <Text weight="bold" color="world">
            {activeEntity.name}
          </Text>
          <div className="flex flex-column gap-xxs">
            <Text variant="b3" color="world">
              {gidPeerUser ? `gid name: ${gidPeerUser.gid_name}` : activeEntity.peerId}
            </Text>
            <Text variant="b3" color="world">
              {tooltipMsg ?
                (
                  <span className='EntityTooltip__tooltipMsg'>
                    <span> {tooltipMsg}</span>
                  </span>
                )
                : (
                  <>
                    <span className="EntityTooltip__boxedKey">E</span>
                    <span> Give Cookie :)</span>
                  </>
                )
              }
            </Text>
          </div>
        </>
      )}
      {activeEntity.interactableType === InteractableType.Interactable && (
        <>
          <Text weight="bold" color="world">
            {activeEntity.name}
          </Text>
          <div className="flex flex-column gap-xxs">
            <Text variant="b3" color="world">
              <span className="EntityTooltip__boxedKey">E</span> /
              <Icon src={MouseIC} size="sm" className="EntityTooltip__mouseIcon" color="world" />
              <span> Interact</span>
            </Text>
          </div>
        </>
      )}
      {activeEntity.interactableType === InteractableType.UI && (
        <>
          <Text weight="bold" color="world">
            {activeEntity.name}
          </Text>
          <div className="flex flex-column gap-xxs">
            <Text variant="b3" color="world">
              <span className="EntityTooltip__boxedKey">E</span> /
              <Icon src={MouseIC} size="sm" className="EntityTooltip__mouseIcon" color="world" />
              <span> Interact</span>
            </Text>
          </div>
        </>
      )}
      {activeEntity.interactableType === InteractableType.Grabbable && (
        <>
          <Text weight="bold" color="world">
            {activeEntity.name}
          </Text>
          <div className="flex flex-column gap-xxs">
            <Text variant="b3" color="world">
              {activeEntity.ownerId}
            </Text>
            {activeEntity.held ? (
              <>
                <Text variant="b3" color="world">
                  <span className="EntityTooltip__boxedKey">E</span>
                  <span> Drop</span>
                </Text>
                <Text variant="b3" color="world">
                  <Icon src={MouseIC} size="sm" className="EntityTooltip__mouseIcon" color="world" />
                  <span> Throw</span>
                </Text>
              </>
            ) : (
              <Text variant="b3" color="world">
                <span className="EntityTooltip__boxedKey">E</span> /
                <Icon src={MouseIC} size="sm" className="EntityTooltip__mouseIcon" color="world" />
                <span> Grab</span>
              </Text>
            )}
            {activeEntity.ownerId === activeEntity.peerId && (
              <Text variant="b3" color="world">
                <span className="EntityTooltip__boxedKey">X</span>
                <span> Delete</span>
              </Text>
            )}
          </div>
        </>
      )}
      {activeEntity.interactableType === InteractableType.Portal && (
        <>
          {portalProcess.joining && <Dots color="world" size="sm" />}
          <Text weight="bold" color="world">
            {portalProcess.joining ? "Joining portal" : "Portal"}
          </Text>
          <div className="flex flex-column gap-xxs">
            <Text variant="b3" color="world">
              {activeEntity.name}
            </Text>
            {portalProcess.error && (
              <Text variant="b3" color="world">
                {portalProcess.error.message ?? "Unknown error joining portal."}
              </Text>
            )}
            {portalProcess.hasRequirements && (
              <div className={
                classnames("EntityTooltip__requirements", {
                  checking: portalProcess.hasRequirements.checking
                })
              }>
                <Text variant="b3" color="world" >
                  Hello {gidAccount.globalid}!
                </Text>
                <Text variant="b3" color="world">
                  {portalProcess.hasRequirements.msg}
                </Text>
              </div>
            )}
            {!portalProcess.joining && (
              <Text variant="b3" color="world">
                <span className="EntityTooltip__boxedKey">E</span> /
                <Icon src={MouseIC} size="sm" className="EntityTooltip__mouseIcon" color="world" />
                <span> Enter World</span>
              </Text>
            )}
          </div>
        </>
      )}
    </div>
  );
}
