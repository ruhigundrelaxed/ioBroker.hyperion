"use strict";
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
var adapter = new utils.Adapter('hyperion');
var Hyperion = require('hyperion-client');
var convert = require('color-convert');
var hyperion;
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// todo
adapter.on('discover', function (callback) {

});

// todo
adapter.on('install', function (callback) {

});

// todo
adapter.on('uninstall', function (callback) {

});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});
adapter.on('stateChange', function (id, state) {
    if (!state.ack) {
        var id_arr = id.split('.');
        if (id_arr[id_arr.length - 1] === 'activator') {
            setEffect_on_hyperion(id);
        } else if (id_arr[3] === 'activeColorRGB') {
            var myval = state.val;
            adapter.log.debug("Control active Color was set to: " + myval + " !")
            setactiveColor_on_hyperion_rgb(myval);
        } else if (id_arr[3] === 'clear') {
            adapter.log.debug("Control clear was activated!")
            hyperion.clear(function(err, state){
                if (!err){
                    adapter.log.info("Clearing prio on hyperion!")
                }else{
                    adapter.log.warn("Clearing prio failed! The error code is: " + JSON.stringify(err))
                }
            });
        } else if (id_arr[3] === 'clearall') {
            adapter.log.debug("Control clear_all was activated!")
            hyperion.clearall(function(state,err){
                if (!err){
                    adapter.log.info("Clearing all prios on hyperion!")
                }else{
                    adapter.log.warn("Clearing all prios failed! The error code is: " + JSON.stringify(err))
                }
            });
        } else if (id_arr[3] === 'activeColorLum') {
	    var mylum;
	    if (!state){
		   mylum = 0;
	    }else{
         	   mylum = state.val || 0;
	    };	
            adapter.log.debug("Control activeColorLum was set to: " + mylum + "! To do that I have to figure out Hue and Sat as well.");
            adapter.getState("control.activeColorSat", function(err, state){
                if (!err){
		    var mysat;
		    if (!state) {
			mysat = 0;
		    }else{
			mysat = state.val || 0;
		    }	
                    adapter.log.debug("Ok! Figured out Sat:" + mysat + " Now figure out HUE!");
                    adapter.getState("control.activeColorHue", function(err, state){
                        if (!err){
                            var myhue = state.val || 0;
                            adapter.log.debug("Ok! Figured out Hue. So we should have all 3 values. H: " + myhue + " S " + mysat + " L " + mylum + " ! Setting Color...");
                            setcolorHSL(myhue, mysat, mylum);
                        }else{
                            adapter.log.warn("Failed to get the HUE val! This should not happen! The error code is: " + JSON.stringify(err));
                        };
                    }.bind(mysat).bind(mylum));
                }else{
                    adapter.log.warn("Could not get activeColorSat. This should not happen! The error code is: " + JSON.stringify(err));
                }
            }.bind(mylum));
        } else if (id_arr[3] === 'activeColorSat') {
            var mysat = state.val;
            adapter.log.debug("Control activeColorSat was set to: " + mysat + "! To do that I have to figure out Hue and Lum as well.");
            adapter.getState("control.activeColorLum", function(err, state){
                if (!err){
                    var mylum = state.val || 0;
                    adapter.log.debug("Ok! Figured out Lum:" + mylum + " Now figure out HUE!");
                    adapter.getState("control.activeColorHue", function(err, state){
                        if (!err){
                            var myhue = state.val || 0;
                            adapter.log.debug("Ok! Figured out Hue. So we should have all 3 values. H: " + myhue + " S " + mysat + " L " + mylum + " ! Setting Color...");
                            setcolorHSL(myhue, mysat, mylum);
                        }else{
                            adapter.log.warn("Failed to get the HUE val! This should not happen! The error code is: " + JSON.stringify(err));
                        };
                    }.bind(mysat).bind(mylum));
                }else{
                    adapter.log.warn("Failed to get the Lum val! This should not happen! The error code is: " + JSON.stringify(err));
                }
            }.bind(mysat));
	            } else if (id_arr[3] === 'activeColorHue') {
            var myhue = state.val;
            adapter.log.debug("Control activeColorHue was set to: " + myhue + "! To do that I have to figure out Sat and Lum as well.");
            adapter.getState("control.activeColorSat", function(err, state){
                if (!err){
		    var mysat;
		    if (!state) {
			    mysat = 0;
		    }else{
			    mysat = state.val || 0;
		    }
                    adapter.log.debug("Ok! Figured out Sat:" + mysat + " Now figure out Lum!");
                    adapter.getState("control.activeColorLum", function(err, state){
                        if(!err){
                            var mylum;
			    if (!state){
				   mylum = 0;
			    }else{
				   mylum = state.val || 0;
			    };
                            adapter.log.debug("Ok! Figured out Hue. So we should have all 3 values. H: " + myhue + " S " + mysat + " L " + mylum + " ! Setting Color...");
                            setcolorHSL(myhue, mysat, mylum);
                        }else{
                            adapter.log.warn("Failed to get the Lum val! This should not happen! The error code is: " + JSON.stringify(err));
                        }
                    }.bind(mysat).bind(myhue));
                }else{
                    adapter.log.warn("Could not get activeColorSat. This should not happen! The error code is: " + JSON.stringify(err));
                }
            }.bind(myhue));
        }
    }
});

function setcolorHSL(hue, sat, lum){
    var myrgb = convert.hsl.rgb(hue, sat, lum);
    var myrgbhex = convert.hsl.hex(hue, sat, lum);
    adapter.setState("control.activeColorRGB", "#"+myrgbhex, true);
    adapter.log.debug("setcolorHSL was called! This are our values: HUE (arg)" + hue + " Sat (arg)" + sat + " LUM (arg)" + lum + " RGB (calc)" + myrgb + " HEX (calc)" + myrgbhex + " ...calling setactiveColor_on_hyperion!");
    setactiveColor_on_hyperion(myrgb[0]+ "," + myrgb[1] + "," + myrgb[2]);
}

function clean_number(number){
var output_number;
	if (number < 0) {
        output_number = number * (-1);
	}
	if (number > 255){
        output_number = number / 10000;
	}
	if ( output_number){
	   adapter.log.warn("The number :" + number  + " was cleaned to " + output_number + " ! This usually should not happen.");
	   return output_number;
    }
	return number;
}
function setactiveColor_on_hyperion(color){
  adapter.log.info("Setting color to" + color);
    var myrgb = color.split(',');
    myrgb[0] = clean_number(parseInt(myrgb[0]));
    myrgb[1] = clean_number(parseInt(myrgb[1]));
    myrgb[2] = clean_number(parseInt(myrgb[2]));
    hyperion.setColor(myrgb, function( err, result ){
        if (!err) {
            adapter.log.info('Set Color: ' + myrgb);
        } else {
            adapter.log.warning("setColor (setactiveColor_on_hyperion) Failed with error code: " + JSON.stringify(err));
        }
    })
}


function setactiveColor_on_hyperion_rgb(color){
  adapter.log.info("Setting color (rgb) to " + color);
    var myrgb = convert.hex.rgb(color);
    var myhsl = convert.hex.hsl(color);
    adapter.log.debug("Ok. Lets set hue, sat and lum to the corresponding values. The hue value is: " + myhsl[0] + " sat is " + myhsl[1] + " lum is " + myhsl[2] + " !");
    adapter.setState("control.activeColorHue", myhsl[0], true);
    adapter.setState("control.activeColorSat", myhsl[2], true);
    adapter.setState("control.activeColorLum", myhsl[1], true);
    myrgb[0] = clean_number(parseInt(myrgb[0]));
    myrgb[1] = clean_number(parseInt(myrgb[1]));
    myrgb[2] = clean_number(parseInt(myrgb[2]));
    hyperion.setColor(myrgb, function( err, result ){
        if (!err) {
            adapter.log.info('Set Color: ' + myrgb);
        } else {
            adapter.log.warning("setColor (setactiveColor_on_hyperion_rgb) Failed with error code: " + JSON.stringify(err));
        }
    })
}



function setEffect_on_hyperion(id){
    id = id.replace('activator','effects_effect_name');
    adapter.getState(id, function(err, state){
        if (!err){
            var myname = state.val;
            var myargument_object = {};
            adapter.getStates('effects.'+ id.split('.')[3] + '*',function(err, result){
                var my_res = Object.keys(result);
                for (var i=0;i <= my_res.length - 1; i++){
                    var my_res_arr = my_res[i].split('.');
                    var my_argument = my_res_arr[my_res_arr.length - 1];
                    if (my_argument !== 'activator' & my_argument !== 'effects_effect_name'){
                        if (typeof result[my_res[i]].val === 'string') {
                            if (result[my_res[i]].val.split(',').length > 0) {
                                //value is array
                                var my_val_array = result[my_res[i]].val.split(',').map(function(item) {
                                    return parseInt(item, 10);
                                });


                                myargument_object[my_argument] = my_val_array;
                            }else{
                                //value is string
                                myargument_object[my_argument] = '"' +result[my_res[i]].val + '"';
                            }
                        }else{
                            //value is number
                            myargument_object[my_argument] = result[my_res[i]].val;
                        }
                    }
                }
                console.log(JSON.stringify(myargument_object));
                hyperion.setEffect(myname, myargument_object, function( err, result ) {
                    console.log(myname);
                    if (!err) {
                        adapter.setState('contorl.activeEffects', myname);
                        adapter.log.info('Set effect: ' + myname);
                        //console.log(JSON.stringify(result));
                    } else {
                        adapter.log.warning(JSON.stringify(err));
                    }
                }.bind(myname) )
            }.bind(myname))
        }
    });
}
adapter.on('ready', function () {
    main();
});


function main() {

    adapter.setState("info.connection", false, true);
    hyperion = new Hyperion( adapter.config['address']  || '127.0.0.1', adapter.config['json_port'] || 19444 , parseInt(adapter.config['prio']) || 100);
    var Type = require('type-of-is');
    hyperion.on('error', function(error){
        adapter.setState("info.connection", false, true);
        adapter.log.warn('error:' +  error);
    });
    hyperion.on('connect', function(){
        adapter.setState("info.connection", true, true);
        adapter.log.info('Hooray! We are connected to hyperiond!');
        hyperion.getServerinfo(function( err, result ){
            var my_effects = result.info.effects;
            if (my_effects){  //some effects present so create device effects
                var mydevice = {type: 'device',common: {name: 'effects'}, native:{id: 'effects'}};
                adapter.setObject('effects', mydevice);
                for (var effect in my_effects){
                    var new_effect = {};
                    new_effect['type'] = "channel";
                    var my_effect_name = my_effects[effect].name;
                    var my_effect_friendly_name = my_effect_name.replace(".","_").replace(/\s/g,"_").toLowerCase();
                    var myeffect_obj = {type: 'channel', common:{name: my_effect_friendly_name}, native:{id: 'effects' + my_effect_friendly_name}};
                    adapter.setObject('effects' + '.' + my_effect_friendly_name , myeffect_obj);
                    var my_effect_args = my_effects[effect].args;
                    var my_activator_switch = {type: 'state', common: {role: 'button',   type:'switch', name: 'activator'}, native:{id: 'effects' + my_effect_friendly_name + '.activator'}};
                    adapter.setObject('effects' + '.' + my_effect_friendly_name  + '.activator' , my_activator_switch);
                    var my_effect_name_obj = {type: 'state', common: {role: 'text.url', type: 'text', name: 'effect_name'}, native:{id: 'effects_effect_name'}};
                    adapter.setObject('effects' + '.' + my_effect_friendly_name + '.'+ 'effects_effect_name',my_effect_name_obj);
                    adapter.setState('effects' + '.' + my_effect_friendly_name + '.'+ 'effects_effect_name',my_effects[effect].name);
                    for (var myarg in my_effect_args){
                        var my_arg_name = myarg;
                        var my_arg = my_effect_args[myarg];
                        var my_argument_obj = {};
                        if (Type.is(my_arg, Number)){
                            my_argument_obj = {type: 'state', common: {role: 'level', type: 'number', name: my_arg_name}, native:{id: 'effects' + my_effect_friendly_name + my_arg_name}};
                            adapter.setObject('effects' + '.' + my_effect_friendly_name  + '.' + my_arg_name, my_argument_obj);
                            adapter.setState('effects' + '.' + my_effect_friendly_name  + '.' + my_arg_name, my_arg);
                        }else if(Type.is(my_arg, Boolean)){
                            my_argument_obj = {type: 'state', common: {role: 'switch', type: 'state', name: my_arg_name}, native:{id: 'effects' + my_effect_friendly_name + my_arg_name}};
                            adapter.setObject('effects' + '.' + my_effect_friendly_name  + '.' + my_arg_name, my_argument_obj);
                            adapter.setState('effects' + '.' + my_effect_friendly_name  + '.' + my_arg_name, my_arg);
                        }else if(Type.is(my_arg, String)){
                            my_argument_obj = {type: 'state', common: {role: 'text.url', type: 'text', name: my_arg_name}, native:{id: 'effects' + my_effect_friendly_name + my_arg_name}};
                            adapter.setObject('effects' + '.' + my_effect_friendly_name  + '.' + my_arg_name, my_argument_obj);
                            adapter.setState('effects' + '.' + my_effect_friendly_name  + '.' + my_arg_name, my_arg);
                        }else if(Type.is(my_arg, Array)){
                            my_argument_obj  = {type: 'state', common: {role: 'level.color.rgb', type: 'state', name: my_arg_name}, native:{id: 'effects' + my_effect_friendly_name + my_arg_name}};
                            adapter.setObject('effects' + '.' + my_effect_friendly_name  + '.' + my_arg_name , my_argument_obj);
                            adapter.setState('effects' + '.' + my_effect_friendly_name  + '.' + my_arg_name, my_arg[0] +',' + my_arg[1] + ',' +my_arg[2]);
                        }else{
                            adapter.log.info("The Argument " + my_arg_name + " is " + my_arg + " and of type " + typeof my_arg);
                        }
                    }
                }
            }
            var my_adjustment = result.info.adjustment;
            if(my_adjustment){
                var mydevice = {type: 'device',common: {name: 'adjustment'}, native:{id: 'adjustment'}};
                adapter.setObject('adjustment', mydevice);
                for (var adjustment in my_adjustment){
                    var my_adj_elm = my_adjustment[adjustment];
                    var my_adj_id = my_adj_elm.id || 'default';
                    var my_adj_obj = {type: 'channel', common:{name: my_adj_id}, native:{id: 'adjustment' + my_adj_id}};
                    adapter.setObject('adjustment' + '.' + my_adj_id , my_adj_obj);
                    var my_red_Adjust = {type: 'state', common: {role: 'level.color.rgb', name: 'my_red_Adjust', type: 'state'}, native:{id: 'adjustment' + my_adj_id  + 'my_red_Adjust'}};
                    var my_green_Adjust = {type: 'state', common: {role: 'level.color.rgb', name: 'my_green_Adjust', type: 'state'}, native:{id: 'adjustment' + my_adj_id  + 'my_green_Adjust'}};
                    var my_blue_Adjust = {type: 'state', common: {role: 'level.color.rgb', name: 'my_blue_Adjust', type: 'state'}, native:{id: 'adjustment' + my_adj_id  + 'my_blue_Adjust'}};
                    adapter.setObject('adjustment.' + my_adj_id  + '.my_red_Adjust', my_red_Adjust);
                    adapter.setObject('adjustment.' + my_adj_id  + '.my_green_Adjust', my_green_Adjust);
                    adapter.setObject('adjustment.' + my_adj_id  + '.my_blue_Adjust', my_blue_Adjust);
                    adapter.setState('adjustment.' + my_adj_id  + '.my_red_Adjust', my_adj_elm.redAdjust[0] + ',' + my_adj_elm.redAdjust[1]  + ','  + my_adj_elm.redAdjust[2] );
                    adapter.setState('adjustment.' + my_adj_id  + '.my_green_Adjust', my_adj_elm.greenAdjust[0] + ',' + my_adj_elm.greenAdjust[1]  + ','  + my_adj_elm.greenAdjust[2] );
                    adapter.setState('adjustment.' + my_adj_id  + '.my_blue_Adjust', my_adj_elm.blueAdjust[0] + ',' + my_adj_elm.blueAdjust[1]  + ','  + my_adj_elm.blueAdjust[2] );
                }

            }
        })
    });
    adapter.subscribeStates('*');
}
