# Control a tcMenu Arduino project using embedCONTROL.

## Summary

Dave Cherry / TheCodersCorner.com make this framework available for you to use. It takes me significant effort to keep all my libraries current and working on a wide range of boards. Please consider making at least a one off donation via the sponsor button if you find it useful.

This version of embedCONTROL is able to be served up by an ESP webserver, and can communicate over websocket back to the device to allow for both updates and remote control. Please ensure any forks contain the text up to here.

For most users (for other than advanced cases) there is no need to build from the source, a very recent version of this code is readily available within tcMenu Designer, and choosing an appropriate webserver plugin for your board gives you the option to use a prebuilt version of this code.

## Known issues

This is a very early version of embedCONTROL-JS. It has quite a few known issues at the moment, but it mainly works for simple cases. Not all the problems yet have issues fully raised in the database, as we haven't fully isolated them yet. 

* Sometimes, reconnections don't work and there's a need to refresh the page.
* There are a couple of oddities around.
* Some components don't edit particularly well at the moment.
* There is no easy way to use a slider for values on Analog items. 

## Deployment

The deployed size when gzipped is around 90K in size when gzipped. We'll look to get that down a little over time, but even that is very manageable from a wide range of boards.

As above, most users don't need to build this. However, should you wish to build the application from source you'll need Node.js npm installed. Once this is installed you can then build the application with

    npm run build

### Deploying for ESP ASync Webserver 

Once the above step is complete, there will be a deployable image in the `build` directory. At this point you can use the tcMenu CLI command to convert this into code that works with the ESP Async plugin, see [tcMenu CLI documentation to get started](https://www.thecoderscorner.com/products/arduino-libraries/tc-menu/tcmenu-cli-workflow/) 

    tcmenu wrap-ws --directory /Users/dave/IdeaProjects/embedcontrol/build --mode ESP_ASYNC

## Deploying for Raspberry PI Jetty

Copy all the files from the build directory into the root www directory on your Raspberry PI. For the standard plugin, we zip the contents of the build directory and package them with the plugin as a zip file. 

## Questions, community forum and support

There is a forum where questions can be asked, but the rules of engagement are: **this is my hobby, I make it available because it helps others**. Don't expect immediate answers, make sure you've recreated the problem in a simple sketch that you can send to me. Please consider making at least a one time donation using the sponsor link above before using the forum.

* [TCC Libraries community discussion forum](https://www.thecoderscorner.com/jforum/)
* [Consultancy pages on the coders corner](https://www.thecoderscorner.com/support-services/consultancy/)
* I also monitor the Arduino forum [https://forum.arduino.cc/], Arduino related questions can be asked there too.

## Helping out, joining the cause, fixing stuff

It would be great if you could help us out in any way possible.  