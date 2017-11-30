![Logo](admin/motion.png)
ioBroker motion Adapter
==============

Control, configure and receive Events from Motion.


### 0.0.0 (2015-14-04)
Pre Release
Known Bugs and Issues:
This is a very early release, and it's not yet finished.
Please don't use it. It's not ready.
Many things are still hardcoded, there's no error handling and many things are
not implemented.




## Install & Configuration

1st.)   Install Motion and configure it. Test if all runs correctly.
2nd.)   Switch off html output of the http control interface. (control_html_output = off) in motion.conf.
3rd.)   Install the adapter by pulling it out of git and placing it in the folder iobroker.motion, where your adapters at.
        This will be easier, later on when it's on npm. Go inside io.motion and run npm install to install it's dependencies.
        Configure the adapter according your needs.
4rd.)   Create a shell script with the following content:
-----------------------------------------------------------
        #!/bin/bash
        case $1 in
           "on_area_detected" )
                json_answer="{\"event\": \"on_area_detected\", \"thread\": $2, \"timestamp\": \"$3\", \"noiselevel\": $4}"
                ;;
           "on_camera_lost" )
                json_answer="{\"event\": \"on_camera_lost\", \"thread\": $2, \"timestamp\": \"$3\"}"
                ;;
           "on_event_start" )
                json_answer="{\"event\": \"on_event_start\", \"thread\": $2, \"timestamp\": \"$3\", \"noiselevel\": $4}"
                ;;
           "on_event_end" )
                json_answer="{\"event\": \"on_event_end\", \"thread\": $2, \"timestamp\": \"$3\", \"noiselevel\": $4}"
                ;;
           "on_motion_detected" )
               json_answer="{\"event\": \"on_motion_detected\", \"thread\": $2, \"timestamp\": \"$3\", \"noiselevel\": $4}"
                ;;
           "on_movie_start" )
               json_answer="{\"event\": \"on_movie_start\", \"thread\": $2, \"timestamp\": \"$3\", \"noiselevel\": $4, \"filename\": \"$5\"}"
                ;;
           "on_movie_end" )
               json_answer="{\"event\": \"on_movie_end\", \"thread\": $2, \"timestamp\": \"$3\", \"noiselevel\": $4, \"filename\": \"$5\"}"
                ;;
           "on_picture_save" )
                json_answer="{\"event\": \"on_picture_save\", \"thread\": $2, \"timestamp\": \"$3\", \"noiselevel\": $4, \"filename\": \"$5\"}"
                ;;
            *)
               json_answer=$1

        esac



        echo $json_answer |netcat 127.0.0.1 6666

-----------------------------------------------------------
This will code the arguments, which are passed by motion to a valid json string and will send it to the host (in this case 127.0.0.1) which will listen on
the port which is configured in the adapter settings. (In this case 6666)

Modify the motion.conf file, that this shell script is fired on every usable event and passing its modifier as arguments.
In my case the created shell script is called test.sh. So the section in my motion.conf looks like:

 # Command to be executed when an event ends after a period of no motion
 # (default: none). The period of no motion is defined by option event_gap.
 on_event_end /usr/local/etc/test.sh on_event_end %t %s %N

 # Command to be executed when a picture (.ppm|.jpg) is saved (default: none)
 # To give the filename as an argument to a command append it with %f
 on_picture_save /usr/local/etc/test.sh on_picture_save %t %s %N %f

 # Command to be executed when a motion frame is detected (default: none)
 //on_motion_detected /usr/local/etc/test.sh on_motion_detected %t %s %N <--This is commented out, because it's unusable. Use on_event!

 # Command to be executed when motion in a predefined area is detected
 # Check option 'area_detect'. (default: none)
 on_area_detected /usr/local/etc/test.sh on_area_detected %t %s %N

 # Command to be executed when a movie file (.mpg|.avi) is created. (default: none)
 # To give the filename as an argument to a command append it with %f
 on_movie_start /usr/local/etc/test.sh on_movie_start %t %s %N %f

 # Command to be executed when a movie file (.mpg|.avi) is closed. (default: none)
 # To give the filename as an argument to a command append it with %f
 on_movie_end /usr/local/etc/test.sh on_movie_end %t %s %N %f

 # Command to be executed when a camera can't be opened or if it is lost
 # NOTE: There is situations when motion don't detect a lost camera!
 # It depends on the driver, some drivers dosn't detect a lost camera at all
 # Some hangs the motion thread. Some even hangs the PC! (default: none)
 on_camera_lost /usr/local/etc/test.sh on_camera_lost %t %s %N


The other adapter config options should be clear. (The Motion HTTP Server & Port as specified in motion.conf)


## Usage

## License

The MIT License (MIT)

Copyright (c) 2015 ruhigundrelaxed

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
