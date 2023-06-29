/* eslint-disable camelcase */
import {
  ChangeEvent,
  KeyboardEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AbortableOperation,
  Client,
  OidcApi,
  Platform,
  QueryLoginResult,
  QueryOIDCResult,
  URLRouter,
} from "@thirdroom/hydrogen-view-sdk";

import { Text } from "../../atoms/text/Text";
import { Input } from "../../atoms/input/Input";
import { Button } from "../../atoms/button/Button";
import { Label } from "../../atoms/text/Label";
import { SettingTile } from "../components/setting-tile/SettingTile";
import { useHydrogen } from "../../hooks/useHydrogen";
import { useGidLoginParams } from "../../hooks/useGidLoginParams";
import { Icon } from "../../atoms/icon/Icon";
import PlanetIC from "../../../../res/ic/planet.svg";
import { useDebounce } from "../../hooks/useDebounce";
import { Dots } from "../../atoms/loading/Dots";
import { IconButton } from "../../atoms/button/IconButton";
import ChevronBottom from "../../../../res/ic/chevron-bottom.svg";
import { DropdownMenu } from "../../atoms/menu/DropdownMenu";
import { DropdownMenuItem } from "../../atoms/menu/DropdownMenuItem";
import { getMissingFeature, MissingFeature } from "../../utils/featureCheck";
import { MissingFeatureModal } from "./MissingFeatureModal";
import "./LoginView.css";
import { useIsMounted } from "../../hooks/useIsMounted";

function useQueryHomeserver(client: Client, homeserver: string) {
  const queryRef = useRef<AbortableOperation<QueryLoginResult>>();
  const [data, setData] = useState<{
    homeserver: string;
    result: undefined | QueryLoginResult;
    error: string | undefined;
    loading: boolean;
  }>({
    homeserver,
    result: undefined,
    error: undefined,
    loading: false,
  });

  const queryCallback = useCallback(
    async (homeserver: string) => {
      setData({
        homeserver,
        result: undefined,
        loading: true,
        error: undefined,
      });
      const queryOperation = client.queryLogin(homeserver);
      queryRef.current = queryOperation;
      try {
        const result = await queryOperation.result;
        setData({
          homeserver,
          result,
          loading: false,
          error: undefined,
        });
      } catch (e: any) {
        setData({
          homeserver,
          result: undefined,
          loading: false,
          error: e.name === "AbortError" ? undefined : "Unable to find homeserver.",
        });
      }
      if (queryRef.current === queryOperation) {
        queryRef.current = undefined;
      }
    },
    [client]
  );

  const debouncedCallback = useDebounce(queryCallback, { wait: 400 });

  useEffect(() => {
    queryRef.current?.abort();
    queryRef.current = undefined;
    queryCallback(homeserver);
  }, [homeserver, queryCallback]);

  const queryHomeserver = (homeserver: string) => {
    queryRef.current?.abort();
    queryRef.current = undefined;
    if (homeserver === "") return;
    debouncedCallback(homeserver);
  };

  return { ...data, queryHomeserver };
}

async function startOIDCLogin(
  platform: Platform,
  urlCreator: URLRouter,
  homeserver: string,
  oidc: QueryOIDCResult,
  oidcApi: OidcApi,
  guest: boolean
) {
  const { openUrl, settingsStorage } = platform;
  const deviceScope = oidcApi.generateDeviceScope();
  const param = oidcApi.generateParams({
    scope: `openid urn:matrix:org.matrix.msc2967.client:api:* ${deviceScope}`,
    redirectUri: urlCreator.createOIDCRedirectURL(),
  });
  const clientId = await oidcApi.clientId();
  await Promise.all([
    settingsStorage.setInt(`oidc_${param.state}_started_at`, Date.now()),
    param.nonce ? settingsStorage.setString(`oidc_${param.state}_nonce`, param.nonce) : Promise.resolve(),
    param.codeVerifier
      ? settingsStorage.setString(`oidc_${param.state}_code_verifier`, param.codeVerifier)
      : Promise.resolve(),
    settingsStorage.setString(`oidc_${param.state}_redirect_uri`, param.redirectUri),
    settingsStorage.setString(`oidc_${param.state}_homeserver`, homeserver),
    settingsStorage.setString(`oidc_${param.state}_issuer`, oidc.issuer),
    settingsStorage.setString(`oidc_${param.state}_client_id`, clientId),
    settingsStorage.setString(`oidc_${param.state}_account_management_url`, oidc.account),
  ]);

  let link = await oidcApi.authorizationEndpoint(param);
  if (guest) {
    link += `&kc_idp_hint=${getMatchingClientConfig(platform, oidc.issuer)?.guestKeycloakIdpHint ?? "guest"}`;
  }

  openUrl(link);
}

function getMatchingClientConfig(platform: Platform, issuer: string) {
  const normalisedIssuer = `${issuer}${issuer.endsWith("/") ? "" : "/"}`;
  return platform.config.staticOidcClients[normalisedIssuer];
}

export default function LoginView() {
  const { platform, urlRouter, login, client } = useHydrogen();
  const [authenticating, setAuthenticating] = useState(false);
  const [oidcError, setOidcError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const isMounted = useIsMounted();

  const [missingFeatures, setMissingFeature] = useState<MissingFeature[]>([]);
  useEffect(() => {
    const run = async () => {
      const missingFeature = await getMissingFeature();
      if (!isMounted()) return;
      setMissingFeature(missingFeature);
    };
    run();
  }, [isMounted]);

  const { homeserver, loading, error, result, queryHomeserver } = useQueryHomeserver(
    client,
    platform.config.defaultHomeServer
  );
  useEffect(() => {
    if (!formRef.current) return;
    const form = formRef.current.elements as typeof formRef.current.elements & {
      homeserver: HTMLInputElement;
    };
    form.homeserver.value = platform.config.defaultHomeServer;
  }, [platform]);

  const { access_token, error_description } = useGidLoginParams()

  useEffect(() => {
    if (error_description !== undefined) {
      setOidcError(error_description);
    }

    if (access_token === undefined) {
      setAuthenticating(false)
      return
    }

    setAuthenticating(true)

    async function exchangeGidMatrixTokens () {
      const url = `https://api.${platform.config.gid.domain}/v1/matrix/login`
      const reqResult = await fetch(url, { headers: { authorization: `Bearer ${access_token}` } })
      const body = await reqResult.json()
      if (reqResult.status < 200 || reqResult.status >= 300) {
        throw new Error(`${reqResult.status} - ${body.error_code || ''} ${body.message || ''}`)
      } else if (body.access_token !== undefined && body.device_id !== undefined && body.user_id !== undefined) {

        console.log('gid: exchange gid token for matrix token')
        await client.startWithAuthData({
          accessToken: body.access_token,
          deviceId: body.device_id,
          userId: body.user_id,
          homeserver: `https://matrix.${platform.config.gid.domain}`,
        })

        console.log('gid: assure connection to verifier')
        const verifierConnection = await fetch(`${platform.config.gid.verifier_api}/connection?token=${access_token}`)
        console.log('gid: got connection to verifier:', verifierConnection)

        setAuthenticating(false)

        localStorage.setItem('gid_account', JSON.stringify({
          ...JSON.parse(atob((access_token as string).split('.')[1])),
          access_token,
          verifierConnection: await verifierConnection.json(),
        }))

        window.location.href = '/'

      } else {
        throw new Error(`Do not know how to handle response: ${JSON.stringify(body, null, 2)}`)
      }
    }

    exchangeGidMatrixTokens()
      .catch(e => {
        localStorage.removeItem('gid_account')
        setAuthenticating(false)
        setOidcError(`GiD token exchange error: ${e.message}`)
      })
  }, [ access_token, error_description, client, platform.config.gid ])

  const handleHomeserverSelect = (hs: string) => {
    if (!formRef.current) return;
    const form = formRef.current.elements as typeof formRef.current.elements & {
      homeserver: HTMLInputElement;
    };
    form.homeserver.value = hs;
    setOidcError(undefined);
    queryHomeserver(hs);
  };

  const handleKeyDown = (evt: KeyboardEvent<HTMLInputElement>) => {
    if (evt.key === "ArrowDown") {
      evt.preventDefault();
      setOpen(true);
    }
  };

  const handleHomeserverChange = (event: ChangeEvent<HTMLInputElement>) => {
    const hs = event.target.value.trim();
    setOidcError(undefined);
    queryHomeserver(hs);
  };

  const handleLoginWithGiD = async () => {
    const redirect = [
      window.location.protocol,
      '//',
      window.location.host
    ].join('')

    const loginUrl = [
      'https://',
      `auth.${platform.config.gid.domain}`,
      '/realms/globalid/protocol/openid-connect/auth',
      `?client_id=${platform.config.gid.kc_client_id}`,
      '&response_type=token&scope=openid&state=gid_login',
      //'&response_mode=query',
      `&redirect_uri=${redirect}`,
    ].join('')

    window.location.href = loginUrl
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!result) return;


    const form = event.currentTarget.elements as typeof event.currentTarget.elements & {
      homeserver: HTMLInputElement;
      username: HTMLInputElement;
      password: HTMLInputElement;
    };
    if (form.homeserver.value !== homeserver) {
      return;
    }


    let loginMethod;
    setAuthenticating(true);
    setOidcError(undefined);
    const guest = (event.nativeEvent as SubmitEvent).submitter?.id === "guest";

    if (form.homeserver.value.includes('globalid')) {
      await handleLoginWithGiD()
      return
    }

    if (result.oidc) {
      const { issuer } = result.oidc;
      const oidcApi = new OidcApi({
        issuer,
        staticClients: platform.config.staticOidcClients,
        request: platform.request,
        encoding: platform.encoding,
        crypto: platform.crypto,
        urlCreator: urlRouter,
      });
      try {
        await oidcApi.registration();
        await oidcApi.metadata();
        await startOIDCLogin(platform, urlRouter, result.homeserver, result.oidc, oidcApi, guest);
      } catch (e) {
        console.error(e);
        setOidcError("This client is not registered by the homeserver.");
      }

      setAuthenticating(false);
      return;
    } else if (result.password) {
      const username = form.username.value.trim();
      const password = form.password.value;
      if (!username || !password || !result) return;

      loginMethod = result.password(username, password);
    }

    if (!loginMethod) {
      setAuthenticating(false);
      return;
    }
    try {
      await login(loginMethod);
    } catch (error) {
      console.error(error);
    }
    setAuthenticating(false);
  };

  const renderGiDLogin = () => (
    <>
      <div className="LoginView__iconAndText">
        <Icon src="https://cdn.global.id/assets/logo/logo-square.png" size="lg" />
        <Text variant="s1" weight="bold">
          Login to GiD
        </Text>
      </div>
        <Button size="lg" variant="primary" type="submit" disabled={authenticating}>
          {authenticating ? <Dots color="on-primary" /> : "Proceed to login"}
      </Button>
    </>
  )

  const renderPasswordLogin = () => (
    <>
      <Text variant="s1" weight="bold">
        Login
      </Text>
      <SettingTile
        label={
          <Label color="surface-low" htmlFor="username">
            Username
          </Label>
        }
      >
        <Input name="username" disabled={authenticating} required />
      </SettingTile>
      <SettingTile
        label={
          <Label color="surface-low" htmlFor="password">
            Password
          </Label>
        }
      >
        <Input name="password" type="password" disabled={authenticating} required />
      </SettingTile>
      <Button size="lg" variant="primary" type="submit" disabled={authenticating}>
        {authenticating ? <Dots color="on-primary" /> : "Login"}
      </Button>
    </>
  );

  if (missingFeatures.length > 0) return <MissingFeatureModal missingFeatures={missingFeatures} />;
  return (
    <div className="LoginView flex justify-center items-start">
      <div className="LoginView__card grow flex flex-column gap-xl">
        <div className="flex items-center gap-sm">
          <Icon src={PlanetIC} size="lg" />
          <Text variant="h2" weight="bold">
            Third Room
          </Text>
        </div>
        <form ref={formRef} className="LoginView__form flex flex-column gap-md" onSubmit={handleLogin}>
          <SettingTile
            label={
              <Label color="surface-low" htmlFor="homeserver">
                Homeserver
              </Label>
            }
          >
            <Input
              defaultValue={platform.config.defaultHomeServer}
              name="homeserver"
              disabled={authenticating}
              onChange={handleHomeserverChange}
              required
              onKeyDown={handleKeyDown}
              after={
                platform.config.homeserverList.length > 0 && (
                  <DropdownMenu
                    open={open}
                    onOpenChange={setOpen}
                    content={platform.config.homeserverList.map((hs: string) => (
                      <DropdownMenuItem key={hs} onSelect={() => handleHomeserverSelect(hs)}>
                        {hs}
                      </DropdownMenuItem>
                    ))}
                  >
                    <IconButton iconSrc={ChevronBottom} label="More Homeserver" tabIndex={-1} />
                  </DropdownMenu>
                )
              }
            />
          </SettingTile>
          {oidcError && (
            <Text color="danger" variant="b2">
              {oidcError}
            </Text>
          )}
          {loading && (
            <div className="flex items-center gap-sm">
              <Dots />
              <Text>Looking for homeserver</Text>
            </div>
          )}
          {result &&
            (result.oidc || result.password ? (
              <>
                {result.oidc && !oidcError ? (
                  getMatchingClientConfig(platform, result.oidc.issuer)?.guestKeycloakIdpHint ? (
                    <>
                      <Button size="lg" variant="primary" type="submit" disabled={authenticating}>
                        {authenticating ? <Dots color="on-primary" /> : "Continue as User"}
                      </Button>
                      <Text
                        className="LoginView__orDivider flex items-center gap-sm"
                        variant="b3"
                        color="surface-low"
                        weight="bold"
                      >
                        OR
                      </Text>
                      <Button
                        id="guest"
                        size="lg"
                        variant="primary"
                        fill="outline"
                        type="submit"
                        disabled={authenticating}
                      >
                        {authenticating ? <Dots color="primary" /> : "Continue as Guest"}
                      </Button>
                    </>
                  ) : (
                    <Button size="lg" variant="primary" type="submit" disabled={authenticating}>
                      {authenticating ? <Dots color="on-primary" /> : "Continue"}
                    </Button>
                  )
                ) : (
                  result.homeserver.includes('globalid')
                    ? renderGiDLogin()
                    : result.password && renderPasswordLogin()
                )}
              </>
            ) : (
              <Text color="danger" variant="b2">
                This client is not supported by the homeserver.
              </Text>
            ))}
          {error && (
            <Text color="danger" variant="b2">
              {error}
            </Text>
          )}
        </form>
      </div>
    </div>
  );
}
