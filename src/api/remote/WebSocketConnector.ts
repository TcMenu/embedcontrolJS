import {APIConnectionListener, APIConnector, APIMessageHandler} from "../MenuController";
import {PROTOCOL_TAG_VAL, TAG_END_OF_MSG, TAG_START_OF_MSG} from "../TagValProtocol";

enum CurrentSocketState {
    DISCONNECTED, CONNECTING, CONNECTED, STOPPED
}

export class WebSocketConnector implements APIConnector {
    url: string;
    connectionListener: APIConnectionListener|undefined = undefined;
    messageHandler: APIMessageHandler|undefined = undefined;
    socket: WebSocket|undefined = undefined;
    state: CurrentSocketState = CurrentSocketState.DISCONNECTED;
    lastDisconnect: number = 0;
    currentData: string = "";

    constructor(url: string) {
        this.url = url;
    }

    start(): void {
        if(this.state === CurrentSocketState.CONNECTING)  return;
        console.info(`Start connection to ${this.getName()}`);
        this.state = CurrentSocketState.CONNECTING;
        this.socket = new WebSocket(this.url);

        this.socket.onclose = (evt) => {
            console.info(`Connection reported onClose ${this.getName()}`);
            if(this.connectionListener) this.connectionListener(false, evt.reason + " - " + evt.code);

            this.lastDisconnect = Date.now();
            this.state = CurrentSocketState.DISCONNECTED;
            this.socket = undefined;
            this.currentData = "";
        }

        this.socket.onopen = ev => {
            console.info(`Connection reports onOpen ${this.getName()}`);
            this.state = CurrentSocketState.CONNECTED;
            if(this.connectionListener) this.connectionListener(true, "");
        };

        this.socket.onmessage = ev => {
            this.currentData += ev.data;
            let possibleMessage = this.getPossibleMessage(PROTOCOL_TAG_VAL);
            while(possibleMessage && this.messageHandler) {
                try {
                    console.debug(`Message received on ${this.getName()} was ${possibleMessage}`);
                    this.messageHandler(PROTOCOL_TAG_VAL, possibleMessage);
                }
                catch(e) {
                    console.log("Unexpected error in message processing");
                    console.log(e);
                }
                possibleMessage = this.getPossibleMessage(PROTOCOL_TAG_VAL); // check if there's a tag val message
            }
        };
    }

    lastDisconnectTime(): number {
        return this.lastDisconnect;
    }

    getPossibleMessage(protocol: number): string|undefined {
        if (this.state !== CurrentSocketState.CONNECTED || !this.currentData) return undefined;
        let position = 0;

        while(position < this.currentData.length && this.currentData.charCodeAt(position) !== TAG_START_OF_MSG) position++;
        position++; // skip message start
        if(position >= this.currentData.length || this.currentData.charCodeAt(position) !== protocol) return undefined;
        let msgStart = position + 1;
        while(position < this.currentData.length && this.currentData.charCodeAt(position) !== TAG_END_OF_MSG) position++;
        if(this.currentData.charCodeAt(position) !== TAG_END_OF_MSG) return undefined;
        let retVal = this.currentData.substring(msgStart, position);
        this.currentData = this.currentData.substring(position + 1);
        return retVal;
    }

    stop(): void {
        this.state = CurrentSocketState.STOPPED;
        this.socket?.close();
    }

    closeConnection(): void {
        console.info(`closeConnection on ${this.getName()}`);
        this.state = CurrentSocketState.DISCONNECTED;
        this.socket?.close();
    }

    getName(): string {
        return `WebSocket(${this.url})`;
    }

    isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    registerConnectionListener(connectionListener: APIConnectionListener): void {
        this.connectionListener = connectionListener;
        connectionListener(this.socket?.readyState ===  WebSocket.OPEN, "");
    }

    registerMessageHandler(messageHandler: APIMessageHandler): void {
        this.messageHandler = messageHandler;
    }

    sendMessage(rawMessage: string): void {
        this.socket?.send(rawMessage);
    }
}