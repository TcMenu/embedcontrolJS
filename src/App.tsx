import React from 'react';
import logo from './img/large_icon.png';
import './App.css';
import {MenuController} from "./api/MenuController";
import {TagValProtocolHandler} from "./api/TagValProtocol";
import {SubMenuUI} from "./MenuUI"
import {SubMenuItem} from "./api/MenuItem";
import {WebSocketConnector} from "./api/remote/WebSocketConnector";

let globalController:MenuController;
let globalSocket: WebSocketConnector
let protectedStart = false;
function doSomeStuff(): void {
  try {
    if(!protectedStart) {
      protectedStart = true;
      globalSocket = new WebSocketConnector("ws:localhost:3333");
      globalController = new MenuController(globalSocket);
      globalController.start();
    }
/*    let rootId = globalController.getTree().getRoot().getMenuId();
    let protocol = globalController.getProtocol();
    protocol.tagValToMenuItem('NJNM=IoTdevice|UU=07cd8bc6-734d-43da-84e7-6084990becfc|VE=1223|PF=1|\u0002')
    protocol.tagValToMenuItem('BAPI=0|ID=2|RO=1|VI=1|AM=255|AO=-180|AD=2|AU=dB|NM=Volume|VC=22|\u0002')
    protocol.tagValToMenuItem('BAPI=0|ID=3|RO=1|VI=1|AM=255|AO=0|AD=1|AU=dB|NM=Bass|VC=22|\u0002')
    globalController.getTree().addMenuItem(rootId, new SubMenuItem("Settings", "1"));
    protocol.tagValToMenuItem('BFPI=1|ID=4|IE=105|NM=FloatMenu|RO=0|VI=0|FD=3|VC=12.0|\u0002')
    console.log(protocol.buildAbsoluteUpdate(globalController.getTree().getRoot(), "1234", false));*/
  }
  catch(err) {
    if(err instanceof Error) console.log(err.message);
    console.log(err);
  }
}

function App() {
  doSomeStuff();
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          embedCONTROL WS
        </p>
      </header>

      <SubMenuUI itemId="0" controller={globalController}></SubMenuUI>
    </div>
  );
}

export default App;
