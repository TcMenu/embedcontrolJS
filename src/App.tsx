import React, {Component} from 'react';
import logo from './img/large_icon.png';
import './App.css';
import {AppInfo, MenuController} from "./api/MenuController";
import {SubMenuUI} from "./MenuUI"
import {WebSocketConnector} from "./api/remote/WebSocketConnector";
import {ButtonType} from "./api/TagValEnums";

const applicationInfo: AppInfo = { name: "ESP32 Amp", uuid: "07cd8bc6-734d-43da-84e7-6084990becfc" }

let globalController:MenuController;
let globalSocket: WebSocketConnector
let hasStartedYet = false;

function initialiseApiIfNeeded(): void {
  try {
    if(!hasStartedYet) {
      hasStartedYet = true;
      globalSocket = new WebSocketConnector("ws:localhost:3333");
      globalController = new MenuController(globalSocket, applicationInfo);
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
          {applicationInfo.name} control
        </p>
      </header>

      <DialogItemUI controller={globalController}/>
      <SubMenuUI itemId="0" controller={globalController}/>
    </div>
  );
}

interface DialogState {
  shown: boolean;
  title: string;
  content: string;
  button1: ButtonType;
  button2: ButtonType;
}

class DialogItemUI extends Component<{ controller: MenuController}, DialogState> {

  constructor(props: {controller: MenuController}) {
    super(props);
    props.controller.registerDialogListener((shown: boolean, title: string, content: string, btn1: ButtonType, btn2: ButtonType) => {
      this.setState({title: title, content: content, button1: btn1, button2: btn2, shown: shown});
    });
    this.button1Clicked = this.button1Clicked.bind(this);
    this.button2Clicked = this.button2Clicked.bind(this);
  }

  textFromBtnType(btn: ButtonType) {
    switch(btn) {
      case ButtonType.ACCEPT: return "Accept";
      case ButtonType.CANCEL: return "Cancel";
      case ButtonType.OK: return "OK";
      case ButtonType.CLOSE: return "Close";
      default: return "";
    }
  }

  button1Clicked() {
    this.props.controller.sendDialogAction(this.state.button1);
  }

  button2Clicked() {
    this.props.controller.sendDialogAction(this.state.button2);
  }

  render() {
    const dialogClasses = this.state?.shown ? "dialogShown" : "dialogHidden"
    if(!this.state) return <div/>
    return <div className={dialogClasses}>
      <h1>{this.state.title}</h1>
      <h3>{this.state.content}</h3>
      <div>
        <button onClick={this.button1Clicked}>{this.textFromBtnType(this.state.button1)}</button>
        <button onClick={this.button2Clicked}>{this.textFromBtnType(this.state.button2)}</button>
      </div>
    </div>
  }
}


export default App;
