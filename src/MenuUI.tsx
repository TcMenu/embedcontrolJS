import React, {Component} from "react";
import {FloatMenuItem, ListMenuItem, MenuItem, Rgb32MenuItem, SubMenuItem} from "./api/MenuItem";
import {ControllerState, MenuComponent, MenuController} from "./api/MenuController";
import {formatForDisplay, formatStringToWire} from "./api/MenuItemFormatter";
import {AckStatus, isAckStatusError} from "./api/protocol/TagValEnums";
import {PairingPanel} from "./PairingPanel";

enum MenuUIState { READY, PENDING_UPDATE, RECENT_UPDATE, UPDATE_ERROR }
const UPDATE_HIGHLIGHT_TIME = 1000;
const MAXIMUM_WAIT_FOR_CORRELATION = 3000;

export class BaseMenuUI extends Component<{ itemId: string, controller: MenuController }, { value: string }> implements MenuComponent {
    protected itemName: string = "";
    protected itemId: string = "";
    protected readOnly: boolean = false;
    protected lastUpdate: number = Date.now();
    protected itemState: MenuUIState = MenuUIState.READY;
    protected outstandingCorrelation: number = 0;

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
            if(this.itemState === MenuUIState.READY) this.itemState = MenuUIState.RECENT_UPDATE;
            this.lastUpdate = Date.now();
            this.internalUpdateItem(item);
        }
    }

    ackReceived(correlationId: number, ackStatus: AckStatus) {
        if(correlationId === this.outstandingCorrelation) {
            this.outstandingCorrelation = 0;
            this.itemState = isAckStatusError(ackStatus) ? MenuUIState.UPDATE_ERROR : MenuUIState.RECENT_UPDATE;
            this.forceUpdate();
        }
    }

    tick(timeNow: number): void {
        const ticks = timeNow - this.lastUpdate;
        if(this.itemState === MenuUIState.PENDING_UPDATE) {
            if(ticks > MAXIMUM_WAIT_FOR_CORRELATION) {
                this.itemState = MenuUIState.UPDATE_ERROR;
                this.outstandingCorrelation = 0;
                this.lastUpdate = Date.now();
                this.forceUpdate();
            }
        }
        else if(this.itemState !== MenuUIState.READY && ticks > UPDATE_HIGHLIGHT_TIME) {
            this.itemState = MenuUIState.READY;
            this.forceUpdate();
        }
    }

    calculatedClass(baseClass: string): string {
        switch(this.itemState) {
            case MenuUIState.PENDING_UPDATE: return baseClass + " pendingUpdate";
            case MenuUIState.RECENT_UPDATE: return baseClass + " itemHasUpdated";
            case MenuUIState.UPDATE_ERROR: return baseClass + " errorDuringUpdate";
            default: return baseClass;
        }
    }

    internalUpdateItem(item: MenuItem<any>) {
        if (item.getMenuId() === "0") {
            this.itemName = this.props.controller.getMenuName();
        } else {
            this.itemName = item.getItemName();
        }
        this.itemId = item.getMenuId();
        this.readOnly = item.isReadOnly() || (item instanceof FloatMenuItem);
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

    markRecentlyUpdated(correlationId: number|undefined): void {
        this.lastUpdate = Date.now();
        if(correlationId) {
            this.itemState = MenuUIState.PENDING_UPDATE;
            this.outstandingCorrelation = correlationId;
        }
        else {
            this.itemState = MenuUIState.UPDATE_ERROR;
            this.outstandingCorrelation = 0;
        }
        this.forceUpdate();
    }
}

export class SubMenuUI extends BaseMenuUI {
    protected renderableChildren: Array<MenuItem<any>> = [];
    private isExpanded: boolean = true;

    internalUpdateItem(item: SubMenuItem) {
        super.internalUpdateItem(item);
        this.renderableChildren = item.getChildren();
        this.setState( { value: "" });
    }

    bindAllControls(): void {
        this.toggleExpand = this.toggleExpand.bind(this);
    }

    toggleExpand() {
        this.isExpanded = !this.isExpanded;
        this.forceUpdate();
    }

    render() {
        const listItems = this.renderableChildren.filter((it) => it.isVisible()).map((ch) => {
            switch (ch.messageType) {
                case "Sub":
                    return <SubMenuUI controller={this.props.controller} itemId={ch.getMenuId()}/>;
                case "Boolean":
                case "Action":
                    return <ActionableTextMenuItem itemId={ch.getMenuId()} controller={this.props.controller}/>
                case "Analog":
                case "Enum":
                case "Scroll":
                    return <UpDownEditorUI controller={this.props.controller} itemId={ch.getMenuId()}/>
                case "Rgb32":
                    return <Rgb32ColorEditor itemId={ch.getMenuId()} controller={this.props.controller}/>
                case "List":
                    return <ListMenuItemUI itemId={ch.getMenuId()} controller={this.props.controller}/>
                default:
                    return <TextBasedMenuUI controller={this.props.controller} itemId={ch.getMenuId()}/>
            }
        });

        return <div>
            <div className="subMenu">
                <h3>
                    <button onClick={this.toggleExpand}>{this.isExpanded ? "-" : "+"}</button>
                    {this.itemName}
                </h3>
                <div className={this.isExpanded ? "subShown" : "subHidden" }>{listItems}</div>
            </div>
        </div>
    }
}

export class RootSubMenuUI extends SubMenuUI {
    private pairingMode: boolean = false;

    bindAllControls() {
        this.props.controller.registerStateListener((state: ControllerState) => {
            if (state === ControllerState.FAILED_AUTHENTICATION) {
                this.pairingMode = true;
            }
            this.itemHasUpdated();
        });
    }

    render() {
        if (this.pairingMode) {
            return <PairingPanel controller={this.props.controller}/>
        } else return super.render();
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
        const correlation = this.props.controller?.sendDeltaUpdate(this.props.itemId, -1);
        this.markRecentlyUpdated(correlation);
    }

    sendIncrease() {
        const correlation = this.props.controller?.sendDeltaUpdate(this.props.itemId, 1);
        this.markRecentlyUpdated(correlation);
    }

    render() {
        return <div className={this.calculatedClass("upDownControl")}>
            <button className="leftBtn" disabled={this.readOnly} onClick={this.sendDecrease}>&lt;</button>
            <button className="rightBtn" disabled={this.readOnly} onClick={this.sendIncrease}>&gt;</button>
            <span>{this.itemName}: {this.state?.value}</span>
        </div>
    }
}

export class TextBasedMenuUI extends BaseMenuUI {
    private editingMode:boolean = false;
    private rollbackValue:string = "";

    bindAllControls() {
        this.startEditing = this.startEditing.bind(this);
        this.cancelPressed = this.cancelPressed.bind(this);
        this.submitPressed = this.submitPressed.bind(this);
        this.textHasChanged = this.textHasChanged.bind(this);
    }

    startEditing() {
        this.editingMode = true;
        this.itemHasUpdated();
        this.rollbackValue = this.state.value;
    }

    cancelPressed() {
        this.editingMode = false;
        this.setState({ value: this.rollbackValue });
        this.itemHasUpdated();
    }

    submitPressed() {
        try {
            this.editingMode = false;
            let item = this.props.controller.getTree().getMenuItemFor(this.props.itemId);
            const correlation = this.props.controller.sendAbsoluteUpdate(this.props.itemId, formatStringToWire(item, this.state.value));
            this.markRecentlyUpdated(correlation);
        }
        catch(e) {
            alert("Problem submitting value: " + e);
            console.error("Problem during submit of value");
            console.error(e);
        }
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
                <button className="rightBtn" disabled={this.readOnly} onClick={this.submitPressed}>Submit</button>
                <button className="rightBtn" onClick={this.cancelPressed}>Cancel</button>
                <form >
                    <label>{this.itemName}
                    <input type="text" value={this.state?.value} onChange={this.textHasChanged}/>
                    </label>
                </form>
            </div>
        } else {
            return <div className={this.calculatedClass("upDownControl")}>
                <button className="rightBtn" onClick={this.startEditing}>Edit</button>
                <div>{this.itemName}: {this.state?.value}</div>
            </div>
        }
    }
}

export class ListItemRowUI extends Component<{itemId: string, row: number, text: string, controller: MenuController}, any> {

    render() {
        return <button className="listElementButton" onClick={(e) =>
            this.props.controller.sendListResponseUpdate(this.props.itemId, this.props.row, e.detail > 1)
        }>{this.props.text}</button>;
    }
}

export class ListMenuItemUI extends BaseMenuUI {
    private itemList = Array<string>();

    internalUpdateItem(item: MenuItem<any>) {
        super.internalUpdateItem(item);
        this.setState({ value: "" });
        if(item instanceof ListMenuItem) {
            this.itemList = item.getCurrentValue();
        }
        this.forceUpdate();
    }

    render() {
        let rowNum = 0;
        const listItems = this.itemList.map((data) => <ListItemRowUI itemId={this.itemId} controller={this.props.controller} row={rowNum++} text={data}/>);
        return <div className={this.calculatedClass("upDownControl")}>
            <p>{this.itemName}</p>
            <ul>
                {listItems}
            </ul>
        </div>;
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
        const correlation = this.props.controller.sendActionableUpdate(this.props.itemId);
        this.markRecentlyUpdated(correlation);
    }

    render() {
        return <button disabled={this.readOnly} className={this.calculatedClass("actionableItem")} onClick={this.buttonPressed}>{this.itemName}{this.state?.value}</button>
    }
}

export class Rgb32ColorEditor extends BaseMenuUI {
    private editingStarted: boolean = false;

    bindAllControls() {
        this.editingRequested = this.editingRequested.bind(this);
        this.submitPressed = this.submitPressed.bind(this);
        this.colorHasChanged = this.colorHasChanged.bind(this);
    }

    internalUpdateItem(item: Rgb32MenuItem) {
        super.internalUpdateItem(item);
        this.setState({value: item.getCurrentValue()} );
    }

    editingRequested() {
        this.editingStarted = true;
        this.itemHasUpdated();
    }

    colorHasChanged(event: React.FormEvent<HTMLInputElement>) {
        this.setState({ value: event.currentTarget.value });
    }

    submitPressed() {
        try {
            this.editingStarted = false;
            let item = this.props.controller.getTree().getMenuItemFor(this.props.itemId);
            const correlation = this.props.controller.sendAbsoluteUpdate(this.props.itemId, formatStringToWire(item, this.state.value));
            this.markRecentlyUpdated(correlation);
        }
        catch(e) {
            alert("Problem submitting value: " + e);
            console.error("Problem during submit of value");
            console.error(e);
        }
    }

    render() {
        const colStyle = {
            backgroundColor: this.state?.value,
        };

        if(this.editingStarted) {
            return <div className="upDownControl colorControl" style={colStyle}>
                <button className="rightBtn" onClick={this.submitPressed}>Submit</button>
                <form>
                    <label>
                        Select color:
                    </label>
                    <input type="color" value={this.state?.value} onChange={this.colorHasChanged}/>
                </form>
            </div>
        } else {
            return <div className={this.calculatedClass("upDownControl colorControl")} style={colStyle}>
                <button disabled={this.readOnly} className="rightBtn" onClick={this.editingRequested}>Change</button>
                <div>{this.state?.value}</div>
            </div>
        }
    }
}