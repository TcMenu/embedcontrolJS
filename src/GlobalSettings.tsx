import {AppInfo, MenuController} from "./api/MenuController";
import { v4 as uuidv4 } from 'uuid';
import React, {Component, FormEvent} from "react";

export class GlobalAppSettings implements AppInfo {
    private uuid: string = uuidv4();
    private appName: string = "Untitled";
    private webSocketExtension: string = "";

    constructor() {
        if(doesCookieExist("settings_appName") && doesCookieExist("settings_appUUID")) {
            this.appName = getCookieOrDefault("settings_appName") ?? "Undefined";
            this.uuid = getCookieOrDefault("settings_appUUID") ?? "Undefined";
            this.webSocketExtension = getCookieOrDefault("settings_webSocketExt") ?? "";
        } else {
            // we must save out the UUID on first run because otherwise we'd get a new one every time around
            // and if authentication is enabled on device, we'd not be able to connect without pairing each time.
            setCookie("settings_appUUID", this.uuid);
            setCookie("settings_appName", "Untitled");
        }
    }

    getAppName(): string {
        return this.appName;
    }

    getAppUuid(): string {
        return this.uuid;
    }

    getWebSocketExtension(): string {
        return this.webSocketExtension;
    }

    setAppName(appName: string): void {
        this.appName = appName;
        setCookie("settings_appName", appName);
    }

    setAppUuid(appUuid: string): void {
        this.uuid = appUuid;
        setCookie("settings_appUUID", appUuid);
    }

    setWebSocketExtension(wsExtension: string) {
        this.webSocketExtension = wsExtension;
        setCookie("settings_webSocketExt", wsExtension);
    }
}

export class GlobalSettingsPanel extends Component<{settings: GlobalAppSettings, controller: MenuController}, string> {
    constructor(props: {settings: GlobalAppSettings, controller: MenuController}) {
        super(props);
        this.appNameHasChanged = this.appNameHasChanged.bind(this);
        this.appUuidHasChanged = this.appUuidHasChanged.bind(this);
        this.webSocketHasChanged = this.webSocketHasChanged.bind(this);
        this.formSubmitPrevention = this.formSubmitPrevention.bind(this);
    }

    public appNameHasChanged(event: React.FormEvent<HTMLInputElement>) {
        this.props.settings.setAppName(event.currentTarget.value);
        this.forceUpdate();
    }

    public appUuidHasChanged() {
        this.props.settings.setAppUuid(uuidv4());
        this.forceUpdate();
    }

    public webSocketHasChanged(event: React.FormEvent<HTMLInputElement>) {
        this.props.settings.setWebSocketExtension(event.currentTarget.value);
        this.forceUpdate();
    }

    public formSubmitPrevention(e: FormEvent) {
        e.preventDefault();
    }

    public render() {
        return <div>
            <h1>Global Settings</h1>
            <form className="settingsForm" onSubmit={this.formSubmitPrevention}>
                <label htmlFor="appNameField">App Name</label>
                <span><input id="appNameField=" name="appName" onChange={this.appNameHasChanged} value={this.props.settings.getAppName()}/></span>
                <label htmlFor="appUuidField">App UUID</label>
                <button onClick={this.appUuidHasChanged}>
                    <i className="fa fa-refresh"/>
                </button>
                <span><input type="text" id="appUuidField" readOnly name="appUuid" value={this.props.settings.getAppUuid()}/></span>
                <h2>Advanced / Dev settings</h2>
                <label htmlFor="websocketAddressField">Web Socket</label>
                <span><input id="websocketAddressField" name="webSockField" onChange={this.webSocketHasChanged} value={this.props.settings.getWebSocketExtension()}/></span>
            </form>
            <p>{process.env.REACT_APP_NAME} Version {process.env.REACT_APP_VERSION}</p>
        </div>;
    }
}

export function setCookie(key: string, value: string) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (365 * 24 * 60 * 60 * 1000));
    document.cookie = key + '=' + value + ';path=/;expires=' + expires.toUTCString();
}

export function getCookieOrDefault(name: string, def: string|undefined = undefined) : string|undefined {
    const nameLenPlus = (name.length + 1);
    return document.cookie
        .split(';')
        .map(c => c.trim())
        .filter(cookie => { return cookie.substring(0, nameLenPlus) === `${name}=`; })
        .map(cookie => { return decodeURIComponent(cookie.substring(nameLenPlus)); })[0] || def;
}

export function doesCookieExist(name: string) {
    return getCookieOrDefault(name) !== undefined;
}
