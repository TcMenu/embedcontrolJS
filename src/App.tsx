import React from 'react';
import logo from './img/large_icon.png';
import './App.css';
import {MenuController} from "./api/MenuController";
import {SubMenuUI} from "./MenuUI"
import {WebSocketConnector} from "./api/remote/WebSocketConnector";

let globalController:MenuController;
let globalSocket: WebSocketConnector
let hasStartedYet = false;

function initialiseApiIfNeeded(): void {
  try {
    if(!hasStartedYet) {
      hasStartedYet = true;
      globalSocket = new WebSocketConnector("ws:localhost:3333");
      globalController = new MenuController(globalSocket);
      globalController.start();
    }
  }
  catch(err) {
    if(err instanceof Error) console.log(err.message);
    console.log(err);
  }
}

function App() {
  initialiseApiIfNeeded();
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
