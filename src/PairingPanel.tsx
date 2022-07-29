import {Component} from "react";
import pairingImg from './img/pairing.webp';
import {MenuController} from "./api/MenuController";

enum PairingMode { NOT_STARTED, STARTED, DONE}
type PairingPanelProps = { controller: MenuController };
type PairingPanelState = { buttonText: string, pairingMode: PairingMode };

export class PairingPanel extends Component<PairingPanelProps, PairingPanelState> {

    constructor(props: Readonly<PairingPanelProps> | PairingPanelProps) {
        super(props);
        this.state = {buttonText: "Start pairing with device", pairingMode: PairingMode.NOT_STARTED};
        this.pairingButtonClicked = this.pairingButtonClicked.bind(this);
    }

    async pairingButtonClicked() {
        if(this.state.pairingMode === PairingMode.NOT_STARTED) {
            const paired = await this.props.controller.attemptPairing((update: string) => {
                this.setState({buttonText: update, pairingMode: PairingMode.STARTED});
            });
            if(paired) {
                this.setState({buttonText: "Successfully paired, close", pairingMode: PairingMode.DONE});
            }
            else {
                this.setState({buttonText: "Failed, try pairing again", pairingMode: PairingMode.NOT_STARTED});
            }
        }
        else if(this.state.pairingMode === PairingMode.STARTED) {
            this.props.controller.stop();
        }
        else {
            window.location.reload();
        }
    }

    render() {
        return <div>
            <h2>Device requires pairing</h2>
            <img src={pairingImg} className="pairing-image" alt="Example pairing screen on device"/>
            <p>This device only allows authorized connections, you need to pair with the device in order to monitor and
                control it. Make sure that the device is within reach as you will need to press 'Accept' on the device itself.</p>
            <p>An example of how the pairing screen will look is presented above, pressing accept gives this connection complete
                control of the device. Ensure you only ever press accept when you are pairing yourself.</p>
            <div>
                <button className="settingsButton" onClick={this.pairingButtonClicked}>{this.state.buttonText}</button>
            </div>
        </div>;
    }
}