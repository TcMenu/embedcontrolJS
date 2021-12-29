import {Component} from "react";
import pairingImg from './img/pairingExample.jpg';
import {ControllerState, MenuController} from "./api/MenuController";

enum PairingMode { NOT_STARTED, STARTED, DONE}
type PairingPanelProps = { controller: MenuController };
type PairingPanelState = { status: string, buttonText: string, pairingMode: PairingMode };

export class PairingPanel extends Component<PairingPanelProps, PairingPanelState> {

    constructor(props: Readonly<PairingPanelProps> | PairingPanelProps) {
        super(props);
        this.state = {status: "Not started", buttonText: "Start pairing", pairingMode: PairingMode.NOT_STARTED};
        this.pairingButtonClicked = this.pairingButtonClicked.bind(this);
    }

    async pairingButtonClicked() {
        if(this.state.pairingMode === PairingMode.NOT_STARTED) {
            const paired = await this.props.controller.attemptPairing((update: string) => {
                this.setState({status: update, buttonText: "Stop pairing attempt", pairingMode: PairingMode.STARTED});
            });
            if(paired) {
                this.setState({status: "Successfully paired", buttonText: "Close and reconnect", pairingMode: PairingMode.DONE});
            }
            else {
                this.setState({status: "Pairing unsuccessful", buttonText: "Try pairing again", pairingMode: PairingMode.NOT_STARTED});
            }
        }
        else if(this.state.pairingMode === PairingMode.STARTED) {
            this.props.controller.stop();
        }
        else {
            // dismiss this window..
        }
    }

    render() {
        return <div>
            <img src={pairingImg} className="pairing-image" alt="Example pairing screen on device"/>
            <p>The connection to the device was not allowed, you need to pair with the device first. To this
            make sure that the device close by before proceeding, as you will need to 'Accept' the pairing on
            the device itself.</p>
            <p>Over to the left is how the pairing screen looks, you simply choose the accept option to allow this
            device to connect. Ensure you only ever press accept when you are pairing yourself.</p>
            <p>Current Status: <span>{this.state.status}</span></p>
            <div>
                <button onClick={this.pairingButtonClicked}>{this.state.buttonText}</button>
            </div>
        </div>;
    }
}