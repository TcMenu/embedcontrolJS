import {Component} from "react";
import {MenuItem, SubMenuItem, AnalogMenuItem, FloatMenuItem, BooleanMenuItem} from "./api/MenuItem";
import {MenuController, MenuComponent} from "./api/MenuController";
import {MenuCommandType} from "./api/TagValEnums";
import {formatForDisplay} from "./api/MenuItemFormatter";

export class BaseMenuUI extends Component<{itemId:string, controller: MenuController}, object>  implements MenuComponent {
    protected itemName: string = "";
    protected itemId: string = "";
    protected readOnly: boolean = false;

    constructor(props: {itemId:string, controller: MenuController}) {
        super(props);
        this.bindAllControls();
    }

    componentDidMount() {
        this.updateItem();
        this.setState(this.props);
    }

    private updateItem() {
        let item = this.props.controller.getTree().getMenuItemFor(this.props.itemId);
        if(item) {
            this.props.controller.putMenuComponent(item.getMenuId(), this);
            this.internalUpdateItem(item);
        }
    }

    internalUpdateItem(item: MenuItem<any>) {
        if(item.getMenuId() === "0") {
            this.itemName = this.props.controller.getMenuName();
        }
        else {
            this.itemName = item.getItemName();
        }
        this.itemId = item.getMenuId();
        this.readOnly = item.isReadOnly();
    }

    bindAllControls():void {
    }

    structureHasChanged() {
        this.updateItem();
        this.forceUpdate();
    }

    itemHasUpdated(): void {
        this.updateItem();
        this.forceUpdate()
    }
}

export class SubMenuUI extends BaseMenuUI {
    protected renderableChildren: Array<MenuItem<any>> = [];

    internalUpdateItem(item: SubMenuItem) {
        super.internalUpdateItem(item);
        this.renderableChildren = item.getChildren();
    }

    render() {
        const listItems = this.renderableChildren.map((ch) => {
            switch (ch.messageType) {
                case "Sub":
                    return <SubMenuUI controller={this.props.controller} itemId={ch.getMenuId()}></SubMenuUI>;
                case "Boolean":
                case "Action":
                    return <ActionableTextMenuItem itemId={ch.getMenuId()} controller={this.props.controller}></ActionableTextMenuItem>
                case "Analog":
                case "Enum":
                    return <UpDownEditorUI controller={this.props.controller} itemId={ch.getMenuId()}></UpDownEditorUI>
                default:
                    return <TextBasedMenuUI controller={this.props.controller} itemId={ch.getMenuId()}></TextBasedMenuUI>
            }
        });

        return <div>
            <div className="subMenu">
                <h3>{this.itemName}</h3>
                <div>{listItems}</div>
            </div>
        </div>
    }
}

export class UpDownEditorUI extends BaseMenuUI {
    displayValue: string = "";

    internalUpdateItem(item: MenuItem<any>) {
        super.internalUpdateItem(item);
        this.displayValue = formatForDisplay(item);
    }

    bindAllControls() {
        this.sendDecrease = this.sendDecrease.bind(this);
        this.sendIncrease = this.sendIncrease.bind(this);
    }

    sendDecrease() {
        this.props.controller?.sendDeltaUpdate(this.props.itemId, -1);
    }

    sendIncrease() {
        this.props.controller?.sendDeltaUpdate(this.props.itemId, 1);
    }

    render() {
        return <div className="upDownControl">
            <button className="leftBtn" disabled={this.readOnly} onClick={this.sendDecrease}>&lt;</button>
            <button className="rightBtn" disabled={this.readOnly} onClick={this.sendIncrease}>&gt;</button>
            <span>{this.itemName}: {this.displayValue}</span>
        </div>
    }
}

export class TextBasedMenuUI extends BaseMenuUI {
    private displayValue: string = "";

    internalUpdateItem(item: FloatMenuItem) {
        super.internalUpdateItem(item);
        this.displayValue = formatForDisplay(item);
    }

    render() {
        return <div className="upDownControl">
            <button className="rightBtn">Edit</button>
            <div>{this.itemName}: {this.displayValue}</div>
        </div>
    }
}

export class ActionableTextMenuItem extends BaseMenuUI {
    private displayValue: string = "";

    bindAllControls() {
        this.buttonPressed = this.buttonPressed.bind(this);
    }

    internalUpdateItem(item: MenuItem<any>) {
        super.internalUpdateItem(item);
        if(item.messageType !== "Action") {
            this.displayValue = ": " + formatForDisplay(item);
        }
        else this.displayValue = "";
    }

    buttonPressed() {
        this.props.controller.sendActionableUpdate(this.props.itemId);
    }

    render() {
        return <button className="actionableItem" onClick={this.buttonPressed}>{this.itemName}{this.displayValue}</button>
    }
}