import React, {Component} from "react";
import {FloatMenuItem, MenuItem, SubMenuItem} from "./api/MenuItem";
import {MenuComponent, MenuController} from "./api/MenuController";
import {formatForDisplay} from "./api/MenuItemFormatter";

export class BaseMenuUI extends Component<{ itemId: string, controller: MenuController }, { value: string }> implements MenuComponent {
    protected itemName: string = "";
    protected itemId: string = "";
    protected readOnly: boolean = false;

    constructor(props: { itemId: string, controller: MenuController }) {
        super(props);
        this.bindAllControls();
    }

    componentDidMount() {
        this.updateItem();
    }

    private updateItem() {
        let item = this.props.controller.getTree().getMenuItemFor(this.props.itemId);
        if (item) {
            this.props.controller.putMenuComponent(item.getMenuId(), this);
            this.internalUpdateItem(item);
        }
    }

    internalUpdateItem(item: MenuItem<any>) {
        if (item.getMenuId() === "0") {
            this.itemName = this.props.controller.getMenuName();
        } else {
            this.itemName = item.getItemName();
        }
        this.itemId = item.getMenuId();
        this.readOnly = item.isReadOnly();
    }

    bindAllControls(): void {
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
        this.setState( { value: "" });
    }

    render() {
        const listItems = this.renderableChildren.map((ch) => {
            switch (ch.messageType) {
                case "Sub":
                    return <SubMenuUI controller={this.props.controller} itemId={ch.getMenuId()}></SubMenuUI>;
                case "Boolean":
                case "Action":
                    return <ActionableTextMenuItem itemId={ch.getMenuId()}
                                                   controller={this.props.controller}></ActionableTextMenuItem>
                case "Analog":
                case "Enum":
                case "Scroll":
                    return <UpDownEditorUI controller={this.props.controller} itemId={ch.getMenuId()}></UpDownEditorUI>
                default:
                    return <TextBasedMenuUI controller={this.props.controller}
                                            itemId={ch.getMenuId()}></TextBasedMenuUI>
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

    internalUpdateItem(item: MenuItem<any>) {
        super.internalUpdateItem(item);
        this.setState({value: formatForDisplay(item) });
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
            <span>{this.itemName}: {this.state?.value}</span>
        </div>
    }
}

export class TextBasedMenuUI extends BaseMenuUI {
    private editingMode:boolean = false;

    bindAllControls() {
        this.startEditing = this.startEditing.bind(this);
        this.cancelPressed = this.cancelPressed.bind(this);
        this.submitPressed = this.submitPressed.bind(this);
        this.textHasChanged = this.textHasChanged.bind(this);
    }

    startEditing() {
        this.editingMode = true;
        this.itemHasUpdated();
    }

    cancelPressed() {
        this.editingMode = false;
        this.itemHasUpdated();
    }

    submitPressed() {
        this.editingMode = false;
        this.props.controller.sendAbsoluteUpdate(this.props.itemId, this.state.value);
        this.itemHasUpdated();
    }

    textHasChanged(event: React.FormEvent<HTMLInputElement>) {
        this.setState({ value: event.currentTarget.value});
    }

    internalUpdateItem(item: FloatMenuItem) {
        super.internalUpdateItem(item);
        this.setState({value: formatForDisplay(item)} );

    }

    render() {
        if (this.editingMode) {
            return <div className="upDownControl">
                <button className="rightBtn" onClick={this.submitPressed}>Submit</button>
                <button className="rightBtn" onClick={this.cancelPressed}>Cancel</button>
                <form >
                    <label>{this.itemName}
                    <input type="text" value={this.state?.value} onChange={this.textHasChanged}/>
                    </label>
                </form>
            </div>
        } else {
            return <div className="upDownControl">
                <button className="rightBtn" onClick={this.startEditing}>Edit</button>
                <div>{this.itemName}: {this.state?.value}</div>
            </div>
        }
    }
}

export class ActionableTextMenuItem extends BaseMenuUI {

    bindAllControls() {
        this.buttonPressed = this.buttonPressed.bind(this);
    }

    internalUpdateItem(item: MenuItem<any>) {
        super.internalUpdateItem(item);
        const extraTxt = (item.messageType !== "Action") ? (": " + formatForDisplay(item)) : "";
        this.setState({ value: extraTxt });
    }

    buttonPressed() {
        this.props.controller.sendActionableUpdate(this.props.itemId);
    }

    render() {
        return <button className="actionableItem" onClick={this.buttonPressed}>{this.itemName}{this.state?.value}</button>
    }
}