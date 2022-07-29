import React, {Component} from 'react';
import logo from './img/large_icon.webp';
import './App.css';
import {MenuController} from "./api/MenuController";
import {RootSubMenuUI} from "./MenuUI"
import {WebSocketConnector} from "./api/remote/WebSocketConnector";
import {ButtonType} from "./api/protocol/TagValEnums";
import {GlobalAppSettings, GlobalSettingsPanel} from "./GlobalSettings";

class App extends Component<any, {settingsActive: boolean}> {
  private static globalSettings: GlobalAppSettings = new GlobalAppSettings();
  private static globalController: MenuController;
  private static globalSocket: WebSocketConnector
  private static hasStartedYet = false;

  constructor(props:any) {
    super(props);
    this.state = {settingsActive: false};
    this.settingsButtonWasPressed = this.settingsButtonWasPressed.bind(this);

    try {
      if (!App.hasStartedYet) {
        App.hasStartedYet = true;
        let customUrl = App.globalSettings.getWebSocketExtension();
        App.globalSocket = new WebSocketConnector(customUrl.length ? customUrl : "ws://" + window.location.host + "/ws");
        App.globalController = new MenuController(App.globalSocket, App.globalSettings);
        App.globalController.start();
      }
    } catch (err) {
      if (err instanceof Error) console.log(err.message);
      console.log(err);
    }
  }

  settingsButtonWasPressed() {
    const st = !this.state.settingsActive;
    this.setState({settingsActive: st});
  }

  render() {
    if(this.state && this.state.settingsActive) {
      return  <div className="App">
        <header className="App-header">
          <button onClick={this.settingsButtonWasPressed} className="settingsButton"><i className="fa fa-close"/> </button>
          <img src={logo} className="App-logo" alt="logo"/>
          <p>
            App Settings
          </p>
        </header>
        <GlobalSettingsPanel settings={App.globalSettings} controller={App.globalController}/>
      </div>

    } 
    return (
        <div className="App">
          <header className="App-header">
            <button onClick={this.settingsButtonWasPressed} className="settingsButton"><i className="fa fa-cog"/></button>
            <img src={logo} className="App-logo" alt="logo"/>
            <p>embedCONTROL {process.env.REACT_APP_VERSION}</p>
          </header>
          <DialogItemUI controller={App.globalController}/>
          <RootSubMenuUI itemId="0" controller={App.globalController}/>
        </div>
    );
  }
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
    if (!this.state) return <div/>

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
