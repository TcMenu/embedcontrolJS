import {
    AckStatus, ApiPlatform,
    BootstrapMode,
    ButtonType,
    ChangeType,
    DialogMode,
    HeartbeatMode,
    MenuCommandType
} from "./TagValEnums";
import {MenuItem} from "../MenuItem";

export class MenuCommand {
    private readonly _commandType: string;

    constructor(commandType: string) {
        this._commandType = commandType;
    }

    get commandType(): string {
        return this._commandType;
    }
}

export class HeartbeatCommand extends MenuCommand {
    private readonly _frequency: number;
    private readonly _mode: HeartbeatMode;

    constructor(frequency: number, hbMode: HeartbeatMode) {
        super(MenuCommandType.HEARTBEAT);
        this._frequency = frequency;
        this._mode = hbMode;
    }

    get frequency(): number {
        return this._frequency;
    }

    get mode(): HeartbeatMode {
        return this._mode;
    }
}

export class BootstrapCommand extends MenuCommand {
    private readonly _bootstrapMode: BootstrapMode;

    constructor(bootstrapMode: BootstrapMode) {
        super(MenuCommandType.BOOTSTRAP);
        this._bootstrapMode = bootstrapMode;
    }

    get bootstrapMode(): BootstrapMode {
        return this._bootstrapMode;
    }
}

export class AcknowledgmentCommand extends MenuCommand {
    private readonly _status: AckStatus;
    private readonly _correlation: string;

    constructor(status: AckStatus, correlation: string) {
        super(MenuCommandType.ACKNOWLEDGEMENT);
        this._status = status;
        this._correlation = correlation;
    }

    get status(): AckStatus {
        return this._status;
    }

    get correlation(): string {
        return this._correlation;
    }
}

export class DialogUpdateCommand extends MenuCommand {
    private readonly _mode: DialogMode;
    private readonly _header: string;
    private readonly _buffer: string;
    private readonly _button1: ButtonType;
    private readonly _button2: ButtonType;
    private _correlation: string;

    constructor(mode: DialogMode, header: string, buffer: string, button1: ButtonType, button2: ButtonType, correlation: string) {
        super(MenuCommandType.DIALOG_UPDATE);
        this._mode = mode;
        this._header = header;
        this._buffer = buffer;
        this._button1 = button1;
        this._button2 = button2;
        this._correlation = correlation;
    }

    get mode(): DialogMode {
        return this._mode;
    }

    get correlation(): string {
        return this._correlation;
    }

    get header(): string {
        return this._header;
    }

    get buffer(): string {
        return this._buffer;
    }

    get button1(): ButtonType {
        return this._button1;
    }

    get button2(): ButtonType {
        return this._button2;
    }
}

export class JoinCommand extends MenuCommand {
    private readonly _name: string;
    private readonly _uuid: string;
    private readonly _platform: ApiPlatform;
    private readonly _version: number;

    constructor(name: string, uuid: string, platform: ApiPlatform, version: number) {
        super(MenuCommandType.JOIN);
        this._name = name;
        this._uuid = uuid;
        this._platform = platform;
        this._version = version;
    }

    get name(): string {
        return this._name;
    }

    get uuid(): string {
        return this._uuid;
    }

    get platform(): ApiPlatform {
        return this._platform;
    }

    get version(): number {
        return this._version;
    }
}

export class ItemChangeCommand extends MenuCommand {
    private readonly _menuId: string;
    private readonly _mode: ChangeType;
    private readonly _value: string|string[]
    private readonly _correlation: string

    constructor(menuId: string, mode: ChangeType, value: string | string[], correlation: string) {
        super(MenuCommandType.CHANGE_INT_FIELD);
        this._menuId = menuId;
        this._mode = mode;
        this._value = value;
        this._correlation = correlation;
    }

    get menuId(): string {
        return this._menuId;
    }

    get mode(): ChangeType {
        return this._mode;
    }

    get value(): string | string[] {
        return this._value;
    }

    get correlation(): string {
        return this._correlation;
    }
}

export class PairingCommand extends MenuCommand {
    private readonly _appName: string;
    private readonly _appUuid: string;


    constructor(appName: string, appUuid: string) {
        super(MenuCommandType.PAIRING_REQUEST);
        this._appName = appName;
        this._appUuid = appUuid;
    }

    get appName(): string {
        return this._appName;
    }

    get appUuid(): string {
        return this._appUuid;
    }
}

export class MenuItemUpdateCommand<T> extends MenuCommand {
    private readonly _item: MenuItem<T>;
    private readonly _parentId: string;
    private readonly _value: T;

    constructor(commandType: string, item: MenuItem<T>, parId: string, value: T) {
        super(commandType);
        this._item = item;
        this._parentId = parId;
        this._value = value;
    }


    get item(): MenuItem<T> {
        return this._item;
    }

    get parentId(): string {
        return this._parentId;
    }

    get value(): T {
        return this._value;
    }
}
