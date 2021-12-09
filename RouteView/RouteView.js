/* *************************************************************************** */
/* *** RouteView - Olivier Singla                                          *** */
/* *** StreetView Player - Virtual Ride, using Google Maps and Street View *** */
/* *** http://StreetViewPlayer.org                                         *** */ 
/* *************************************************************************** */

define( function( m ) {

	var MAX_NB_WAYPOINTS = 23;

	var autocompletes;
    var map;
    var service;
    var panorama, panorama2, panorama3, panorama4;
    var pano_pos = [];
	var map_or_panorama_full_screen;
    var panorama_full_screen;
    var map_pano_layout = 2;
    var curr_leg;
    var play_whole_route;
    var prev_zoom = undefined;
	var timer_show_pano_on_mousemove = undefined;
    var timer_animate = undefined;
    var curr_dist_in_leg;
    var curr_dist_in_route;
    var eol;
    var step = 150;            			// meters
    var interval = 750;        			// milliseconds
    var route_thickness;				// pixels
    var bearing;
    var prev_bearing;
	var prev_pano_id;
	var pano_cnt = 0;
	var skip_cnt = 0;
	var cb_move_to_dist = undefined;
	var directions_service;
	var directions_service_request;
	var directions_renderer = undefined;
	var polylines;
    var route_bounds;
    var legs_bounds = [];
	var distances = [];
	var cb_route_from_or_to_changed_handle;
	var places;
	var got_location;
   	var streetViewLayer;
   	var street_view_check;
   	var marker_small_street_view;
   	var marker_no_street_view;
   	var marker_pos_using_slider;
   	var marker_pos_using_slider_no_pano;
   	var mouse_over_input_route;
   	var is_dirty = false;
   	var is_ff = false;
   	var marker_browser_images_pos;
	var panorama_mouse_down_offsetX = 0;
	var panorama_mouse_down_offsetY = 0;
	var map_type_id = 0;
	
	const api_count = {
		PLACES: 0,
		MAPS_JAVASCRIPT: 1,
		GEOCODING: 2,
		DIRECTIONS: 3
	}
	var api_counts = [4];

	var search_places = [];

   	var route_colors = [
		"#0066cc",
		"#00cc00",
		"#ff6600",
		"#cc33ff",
   	];
   	var route_color = route_colors[0];

	function rgb(red, green, blue) {
		var rgb = blue | (green << 8) | (red << 16);
        return '#' + (0x1000000 + rgb).toString(16).slice(1)
	}
  
	function show_route_distance_duration(dist_meters, duration_secs, waypoint, summary) {

		if (waypoint == undefined)
			console.log( "dist_meters=" + dist_meters + " duration_secs=" + duration_secs );
		else
			console.log( "waypoint " + waypoint + " : dist_meters=" + dist_meters + " duration_secs=" + duration_secs );

		var id = (waypoint == undefined) ? "id_route_info" : "id_tooltip_btn_drive_"+waypoint;

        var nb_hours   = Math.floor( duration_secs / 3600 );
        var nb_minutes = Math.floor( (duration_secs - (nb_hours * 3600)) / 60 );
        var nb_seconds = Math.floor( duration_secs - (nb_hours * 3600) - (nb_minutes * 60) );
        var hms = "";
        if ( nb_hours == 0 ) {
            if ( nb_minutes == 0 ) {
                hms = nb_seconds + '"';
            }
            else {
                if ( nb_seconds == 0 )
                    hms = nb_minutes + "'";
                else
                    hms = nb_minutes + "'" + nb_seconds + '"';
            }
        }
        else {
            hms = nb_hours + "h" + nb_minutes + "'" + nb_seconds + '"';
        }
        
		var content = 
			'<span>' +
			'	<b>' + Math.round( dist_meters / 1000 ) + '</b>&nbsp;kms' +
			'	&nbsp;-&nbsp;' +
			'	<b>' + Math.round( dist_meters * 0.000621371 ) + '</b>&nbsp;miles' +
			'	&nbsp;-&nbsp;' +
			'	<b>' + hms + '</b>';
        if (waypoint == undefined)
			content = content + 
				'	&nbsp;-&nbsp;' +
				'	<b>' + summary + '</b>';
        content  = content + 
			'</span>';

        if (waypoint == undefined) {
            document.getElementById(id).innerHTML = content;
		}
		else {
			dijit.byId(id).set( 'label', content + "<br><br>Play this leg of the route using StreetView" );
		}

    }
    
    function restart_animate_timer( fast ) {

		if ( timer_animate != undefined ) 
			clearTimeout( timer_animate );
		if (interval == 10000) {
			console.log(interval);
			return;
		}
		timer_animate = setTimeout( (function() { return function() {
			cb_animate( curr_dist_in_route + step );
		}})(), (fast) ? 125 : interval );
	}
    
    function cb_animate( d ) {

        if ( dijit.byId('id_btn_pause').get( 'label' ) == "Continue" )
        	return;
		if ( dijit.byId("id_btn_stop").get("disabled") )
			return;

		timer_animate = undefined;
        	
		curr_dist_in_route = d;
        if ( curr_dist_in_route > eol ) {
            console.log( "Route is done" );
            play_whole_route = false;
            return;
        }
        
        if ( play_whole_route || (curr_leg == undefined) ) {
			curr_leg = 0;
			while ( d > distances[curr_leg] )
				curr_leg++;
//			console.log( "curr_leg=" + curr_leg);
		}

		var polyline = polylines[curr_leg];
        
        curr_dist_in_leg = curr_dist_in_route;
        if ( play_whole_route ) {
			if ( curr_leg > 0 )
				curr_dist_in_leg -= distances[ curr_leg - 1 ];
		}
		var p = polyline.GetPointAtDistance( curr_dist_in_leg );

        if ( prev_zoom == undefined )
			if ( !map.getBounds().contains( p ) )
				map.panTo( p );

		(function ( ) {

			street_view_check.getPanoramaByLocation(p, 50, (function() { return function(result, status) {
				if (status == google.maps.StreetViewStatus.ZERO_RESULTS) {
					console.log( "No street view available" );
					marker_small_street_view.setPosition( null );
					marker_no_street_view.setPosition( p );
					if ( step > 0 ) 
						restart_animate_timer( false );
				}
				else {
					marker_no_street_view.setPosition( null );
					var iad = polyline.GetIndexAtDistance( curr_dist_in_leg );
					bearing = polyline.Bearing( iad );
					if (bearing == undefined)
						bearing = prev_bearing;
/*
					if (result.links.length > 1) {
						delta0 = Math.abs(bearing - result.links[0].heading);
						delta1 = Math.abs(bearing - result.links[1].heading);
						if (delta0 < delta1)
							xbearing = result.links[0].heading;
						else
							xbearing = result.links[1].heading;
						console.log( pano_cnt + " -> " + Math.round(curr_dist_in_route*100)/1000 + " / " + Math.round(eol*100)/100 + " --> " + Math.round(bearing*100)/100 + " - " + Math.round(xbearing*100)/100 + " (" + Math.round(result.links[0].heading*100)/100 + " , " + Math.round(result.links[1].heading*100)/100 + ")");
					}
*/
					if (bearing != undefined) {
						(function ( ) {
							panorama.addListener('pano_changed', function() {
								var pano_id = panorama.getPano();
								if (pano_id != prev_pano_id) {
//									marker_small_street_view.setMap( map );
//									console.log("$$$ " + pano_cnt + " - " + (pano_id == prev_pano_id) + " / " + pano_id + " , " + prev_pano_id);
									google.maps.event.clearInstanceListeners(panorama);									
									switch (pano_cnt++ % 3) {
										case 0 :
											pano_pos[4] = panorama.getPosition();
											document.getElementById("id_panorama2").style.zIndex = "1";
											document.getElementById("id_panorama3").style.zIndex = "0"
											document.getElementById("id_panorama4").style.zIndex = "0"
											if (--skip_cnt <= 0)
												panorama4.setPano( prev_pano_id );
											else
												panorama4.setPano( pano_id );
											if ( pano_cnt >= 4 )
												marker_small_street_view.setPosition( pano_pos[(skip_cnt <= 0) ? 2 : 4] );
											if ( prev_bearing != undefined )
												panorama4.setPov( { heading: prev_bearing, pitch: 1 } );
//											console.log( pano_cnt + " --> 2" );
											break;
										case 1 :
											pano_pos[2] = panorama.getPosition();
											document.getElementById("id_panorama3").style.zIndex = "1";
											document.getElementById("id_panorama2").style.zIndex = "0"
											document.getElementById("id_panorama4").style.zIndex = "0";
											if (--skip_cnt <= 0)
												panorama2.setPano( prev_pano_id );
											else
												panorama2.setPano( pano_id );
											if ( pano_cnt >= 4 )
												marker_small_street_view.setPosition( pano_pos[(skip_cnt <= 0) ? 3 : 2] );
											if ( prev_bearing != undefined )
												panorama2.setPov( { heading: prev_bearing, pitch: 1 } );
//											console.log( pano_cnt + " --> 3" );
											break;
										case 2 :
											pano_pos[3] = panorama.getPosition();
											document.getElementById("id_panorama4").style.zIndex = "1"
											document.getElementById("id_panorama3").style.zIndex = "0";
											document.getElementById("id_panorama2").style.zIndex = "0";
											if (--skip_cnt <= 0)
												panorama3.setPano( prev_pano_id );
											else
												panorama3.setPano( pano_id );
											if ( pano_cnt >= 4 )
												marker_small_street_view.setPosition( pano_pos[(skip_cnt <= 0) ? 4 : 3] );
											if ( prev_bearing != undefined )
												panorama3.setPov( { heading: prev_bearing, pitch: 1 } );
//											console.log( pano_cnt + " --> 4" );
											break;
									}
									prev_pano_id = pano_id;
									if ( step > 0 )
										restart_animate_timer( false );
//										restart_animate_timer( (pano_cnt <= 3) );
								}
							});
							panorama.setPosition( p );
	//						if ( prev_bearing != undefined )
	//							panorama.setPov( { heading: prev_bearing, pitch: 1 } );
							prev_bearing = bearing;
						})(  );
//						panorama.setPosition( p );
////						if ( prev_bearing != undefined )
////							panorama.setPov( { heading: prev_bearing, pitch: 1 } );
//						prev_bearing = bearing;
					}
				}
				dijit.byId('id_input_route').set( 'value', d, false );
			}})());

		})(  );

    }

    function start_driving( ) {

		require(["dojo/dom", "dojo/on", "dojo/dom-style"], function( dom, on, domStyle ) {
			domStyle.set( "td_streetview_panel", "display", "none" );
		});
		if ( timer_show_pano_on_mousemove != undefined ) {
			clearTimeout(timer_show_pano_on_mousemove);
			timer_show_pano_on_mousemove = undefined;
		}
		marker_browser_images_pos.setMap( null );

		streetViewLayer.setMap( null );

		if ( timer_animate != undefined )
            clearTimeout( timer_animate );
            
        if ( play_whole_route || (curr_leg == undefined) ) {
			eol = 0;
			distances = [];
			polylines.forEach( function(e) { eol += e.Distance(); distances.push( eol); })
			console.log( distances );
			console.log("eol = " + eol);
			map.setCenter( polylines[0].getPath().getAt(0) );
			show_all_routes();
		}
		else {
			eol = polylines[curr_leg].Distance();
			map.setCenter( polylines[curr_leg].getPath().getAt(0) );
			map.fitBounds( legs_bounds[curr_leg] );
		}

       	timer_animate = setTimeout( function() { cb_animate(50); }, 5 );

        // Update route slider
		dijit.byId('id_input_route').set( 'maximum', eol );
		dijit.byId('id_input_route').set( 'discreteValues,', eol );
		dijit.byId('id_input_route').set( 'value', 0, false );

        map.setOptions( {draggableCursor:'hand'} );

		directions_renderer.setOptions( { zIndex:99, draggable:false } );

		document.getElementById("id_panorama2").style.display = "";
		document.getElementById("id_panorama3").style.display = "";
		document.getElementById("id_panorama4").style.display = "";
		panorama2.setVisible( true );
		panorama3.setVisible( true );
		panorama4.setVisible( true );
		window.dispatchEvent(new Event('resize'));
    }

    function find_first_hidden( ) {

        var first_hidden = MAX_NB_WAYPOINTS + 2;
    	require(["dojo/dom-style"], function( domStyle) {
            for ( var n = 0; n < MAX_NB_WAYPOINTS+2; n++ ) {
            	var id = 'id_tr_' + n;
        		var display = domStyle.get( id, "display" );
//            	console.log( id + " --> " + display );
            	if ( display == "none" ) {
            		first_hidden = n;
            		break;
            	}
            }
 		});
    	
    	return first_hidden;
    }

	function show_all_routes( ) {
	
		if ( dijit.byId("id_btn_drive_1").get("disabled") )
			return;
		console.log( streetViewLayer.getMap() );
		if ( streetViewLayer.getMap() != undefined )
			return;
		map.fitBounds( route_bounds );
	}

	function cb_click_fieldset_route( ) {

    	require(["dojo/dom-style"], function( domStyle) {

           	var id = 'id_fieldset_route';
// 	   		console.log( domStyle.get( id, "background") );
       		domStyle.set( id, "background", (true) ? "#80c1ff": "#b3daff");

    	});
	
	}
    
    function get_route_waypoint( obj, ref ) {
    
		var index_waypoint = obj.indexOf( ref );

		return {waypoint_index: index_waypoint};
    }
    
	function calculateDistance(lat1, long1, lat2, long2) {    

      // radians
      lat1 = (lat1 * 2.0 * Math.PI) / 60.0 / 360.0;      
      long1 = (long1 * 2.0 * Math.PI) / 60.0 / 360.0;    
      lat2 = (lat2 * 2.0 * Math.PI) / 60.0 / 360.0;   
      long2 = (long2 * 2.0 * Math.PI) / 60.0 / 360.0;       


      // use to different earth axis length    
      var a = 6378137.0;        // Earth Major Axis (WGS84)    
      var b = 6356752.3142;     // Minor Axis    
      var f = (a-b) / a;        // "Flattening"    
      var e = 2.0*f - f*f;      // "Eccentricity"      

      var beta = (a / Math.sqrt( 1.0 - e * Math.sin( lat1 ) * Math.sin( lat1 )));    
      var cos = Math.cos( lat1 );    
      var x = beta * cos * Math.cos( long1 );    
      var y = beta * cos * Math.sin( long1 );    
      var z = beta * ( 1 - e ) * Math.sin( lat1 );      

      beta = ( a / Math.sqrt( 1.0 -  e * Math.sin( lat2 ) * Math.sin( lat2 )));    
      cos = Math.cos( lat2 );   
      x -= (beta * cos * Math.cos( long2 ));    
      y -= (beta * cos * Math.sin( long2 ));    
      z -= (beta * (1 - e) * Math.sin( lat2 ));       

      return (Math.sqrt( (x*x) + (y*y) + (z*z) )/1000);  
    }

    function do_route( load_step_interv ) {

	    dijit.byId("id_pane_standby").show();

    	if ( directions_renderer != undefined ) {
    		console.log( "Delete current route" )
    		directions_renderer.setMap( null );
        	directions_renderer = undefined;
        	if ( polylines )
				polylines.forEach( function(e) { e.setMap(null); })
    	}

        var no_hwy  = dijit.byId('id_check_no_hwy').get( 'checked' );
        var no_toll = dijit.byId('id_check_no_toll').get( 'checked' );
        console.log( "no_hwy=" + no_hwy + " no_toll=" + no_toll );

		if ( load_step_interv ) {
			step     = dijit.byId('id_input_meters').get( 'value' );
			interval = dijit.byId('id_input_interval').get( 'value' );
			console.log( "step=" + step + " interval=" + interval );
		}

    	route_thickness = dijit.byId('id_input_route_thickness').get( 'value' );
//  	console.log( "route_thickness=" + route_thickness );

        var first_hidden = find_first_hidden( );
    	console.log( "first_hidden=" + first_hidden );
        
        var start_location = dijit.byId('id_wp_0').get( 'value' );
        console.log( "from = " + start_location );

        var way_points = [];
        for ( var n = 1; n < first_hidden-1; n++ ) {
            waypt = dijit.byId('id_wp_'+n).get( 'value' );
            console.log( "n=" + n + " => [" + waypt + "]" );
            if ( waypt != "" ) {
                way_points.push({
                    location: waypt,
                    stopover: true
                });
            }
        }

        var end_location = dijit.byId('id_wp_'+(first_hidden-1)).get( 'value' );
        console.log( "to   = " + end_location );

//      street_view_check = new google.maps.StreetViewService( );

        directions_service = new google.maps.DirectionsService( );

        directions_renderer = new google.maps.DirectionsRenderer({
            draggable: true,
            map: map,
            hideRouteList: false,
            preserveViewport: true,
            suppressMarkers: false,
	        markerOptions: {
	          	opacity: 1.0,
            },
            polylineOptions: {
                strokeColor: route_color,
            	strokeWeight: route_thickness
            }
        });

    	var initial_info_use_icon = localStorage.getItem("initial_info_use_icon");
    	if ( !initial_info_use_icon ) {
			do_show_message( false, "Information", 
				"<div align='center'>" +
				"  You can play the route between<br><br>" +
				start_location + "<br>" +
				"and<br>" +
				end_location + "<br><br>" +
				"  by using the icon<br><br>" +
				"  <img src='icons/btn-drive.png' style='width:16px;height:16px;'>" +
				"</div>" );
			localStorage.setItem( "initial_info_use_icon", "true" );
		}

        var old_nb_waypoints = way_points.length + 2;
		google.maps.event.clearListeners( directions_renderer, 'directions_changed' );
        directions_renderer.addListener('directions_changed', function() {

			api_counts[api_count.MAPS_JAVASCRIPT]++;
            var new_dir = directions_renderer.getDirections();

			is_dirty = true;
			var path = new_dir.routes[0].overview_path;
			var eventLine = new google.maps.Polyline({
				path: path,
				visible: true,
				strokeOpacity: 0,
				zIndex: 1000,
			}); 
//			console.log( eventLine );
//			console.log( path.length );
			eventLine.setMap( map );

            var index_waypoint = undefined;
            if (new_dir.request.Xc != undefined)
				index_waypoint = new_dir.request.Xc;
            else if (new_dir.request.Yc != undefined)
				index_waypoint = new_dir.request.Yc;
            else if (new_dir.request.Uc != undefined)
				index_waypoint = new_dir.request.Uc;
            else if (new_dir.request.Vc != undefined)
				index_waypoint = new_dir.request.Vc;
            else if (new_dir.request.Yb != undefined)
				index_waypoint = new_dir.request.Yb;
            else if (new_dir.request.ec != undefined)
				index_waypoint = new_dir.request.ec;
            else if (new_dir.request.Ib != undefined)
				index_waypoint = new_dir.request.Ib;
            else if (new_dir.request.Jb != undefined)
				index_waypoint = new_dir.request.Jb;
            else if (new_dir.request.Gb != undefined)
				index_waypoint = new_dir.request.Gb;
            else if (new_dir.request.Hb != undefined)
				index_waypoint = new_dir.request.Hb;
            else if (new_dir.request.Pb != undefined)
				index_waypoint = new_dir.request.Pb;
            else if (new_dir.request.Qb != undefined)
				index_waypoint = new_dir.request.Qb;
            else if (new_dir.request.Rb != undefined)
				index_waypoint = new_dir.request.Rb;
            else if (new_dir.request.Sb != undefined)
				index_waypoint = new_dir.request.Sb;
            else if (new_dir.request.Tb != undefined)
				index_waypoint = new_dir.request.Tb;
            else if (new_dir.request.ac != undefined)
				index_waypoint = new_dir.request.ac;
            else if (new_dir.request.Zb != undefined)
				index_waypoint = new_dir.request.Zb;
            else if (new_dir.request.$b != undefined)
				index_waypoint = new_dir.request.$b;
            else if (new_dir.request.qc != undefined)
				index_waypoint = new_dir.request.qc;
            else if (new_dir.request.nc != undefined)
				index_waypoint = new_dir.request.nc;
            else if (new_dir.request.kc != undefined)
				index_waypoint = new_dir.request.kc;
            else if (new_dir.request.lc != undefined)
				index_waypoint = new_dir.request.lc;
            else if (new_dir.request.ic != undefined)
				index_waypoint = new_dir.request.ic;
            else if (new_dir.request.jc != undefined)
				index_waypoint = new_dir.request.jc;
            else if (new_dir.request.mc != undefined)
				index_waypoint = new_dir.request.mc;
            else if (new_dir.request.dc != undefined)
				index_waypoint = new_dir.request.dc;
            else if (new_dir.request.cc != undefined)
				index_waypoint = new_dir.request.cc;
            else if (new_dir.request.fc != undefined)
				index_waypoint = new_dir.request.fc;
            else if (new_dir.request.uc != undefined)
				index_waypoint = new_dir.request.uc;
            else if (new_dir.request.xc != undefined)
				index_waypoint = new_dir.request.xc;
            else if (new_dir.request.Kd != undefined)
				index_waypoint = new_dir.request.Kd;
            else if (new_dir.request.Jd != undefined)
				index_waypoint = new_dir.request.Jd;
            else if (new_dir.request.Gd != undefined)
				index_waypoint = new_dir.request.Gd;
            else if (new_dir.request.Hd != undefined)
				index_waypoint = new_dir.request.Hd;
            else if (new_dir.request.Ed != undefined)
				index_waypoint = new_dir.request.Ed;
            else if (new_dir.request.Ed != undefined)
				index_waypoint = new_dir.request.Ed;
            else if (new_dir.request.Dd != undefined)
				index_waypoint = new_dir.request.Dd;
            else if (new_dir.request.Pd != undefined)
				index_waypoint = new_dir.request.Pd;
            else if (new_dir.request.ae != undefined)
				index_waypoint = new_dir.request.ae;
            else if (new_dir.request.ri != undefined)
				index_waypoint = new_dir.request.ri;
			console.log("index_waypoint="+index_waypoint);
            if ( index_waypoint == undefined ) {
				console.log( "!!!!UNDEFINED >>>>>>" );
				console.log( new_dir );
			}
			else {

                console.log("---------");
                console.log(directions_renderer);
                console.log(new_dir);
                console.log("---------");
                var new_nb_waypoints = new_dir.geocoded_waypoints.length;
                console.log( "old_nb_waypoints=" + old_nb_waypoints + " new_nb_waypoints=" + new_nb_waypoints + " index_waypoint=" + index_waypoint );
                var place_id = new_dir.geocoded_waypoints[index_waypoint].place_id;

				api_counts[api_count.PLACES]++;
                service.getDetails({
	              	placeId: place_id
                }, function ( place, status ) {
                	if ( status == google.maps.places.PlacesServiceStatus.OK ) {
						console.log("==> " + old_nb_waypoints + "," + new_nb_waypoints + "(" + index_waypoint + ") >> " + place.formatted_address);
                	    if (new_nb_waypoints == old_nb_waypoints) {
                	    	change_waypoint( index_waypoint, place.formatted_address );
                	    }
                	    else {
                	    	cb_click_btn_add( new_nb_waypoints)
                	    	for (var n = old_nb_waypoints - 1; n >= index_waypoint; n--) {
						        var w = dijit.byId('id_wp_'+n).get( 'value' );
						        dijit.byId('id_wp_'+(n+1)).set( 'value', w );
						        places[n+1] = places[n];
                	    	}
                	    	change_waypoint( index_waypoint, place.formatted_address );
                	    	places[index_waypoint] = place;
                	    }
                	}
                	else {
			        	var message = "?";
			            if ( status == google.maps.places.PlacesServiceStatus.UNKNOWN_ERROR )
			            	message = "A directions request could not be processed due to a server error. The request may succeed if you try again.";
			            else if ( status == google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT )
			            	message = "The webpage has gone over the requests limit in too short a period of time.";
			            else if ( status == google.maps.places.PlacesServiceStatus.NOT_FOUND )
			            	message = "At least one of the origin, destination, or waypoints could not be geocoded.";
			            else if ( status == google.maps.places.PlacesServiceStatus.REQUEST_DENIED )
			            	message = "The webpage is not allowed to use the directions service.";
			            else if ( status == google.maps.places.PlacesServiceStatus.ZERO_RESULTS )
			            	message = "No route could be found between the origin and destination.";
			            else if ( status == google.maps.places.PlacesServiceStatus.INVALID_REQUEST )
			            	message = "The PlacesService request provided was invalid.";
			            show_error( message );
                	}
                });

//             	show_error( "Sorry, this feature is not yet implemented!" );
            }

        });

        update_btns_remove_up_down( );
    
        map.setOptions({draggableCursor: 'crosshair'});

		dijit.byId('id_btn_save_gpx').set( 'disabled', false );
		dijit.byId('id_btn_create_gmaps_url').set( 'disabled', false );
		dijit.byId('id_btn_create_long_url').set( 'disabled', false );

        directions_service_request = {
            origin: start_location,
            destination: end_location,
            travelMode: google.maps.DirectionsTravelMode.DRIVING,
            waypoints: way_points,
            optimizeWaypoints: false,
            avoidHighways: no_hwy,
            avoidTolls: no_toll
        };

      	directions_service.route( directions_service_request, 
      		function(response, status) { 
				api_counts[api_count.DIRECTIONS]++;
				cb_make_route(response, status); 
			})

    }
    
	function cb_make_route(response, status) {

		console.log( response );
		console.log( status );

        if ( status == google.maps.DirectionsStatus.OK ) {

		    dijit.byId("id_pane_standby").hide();

			console.log( response );

            var legs = response.routes[0].legs;
            var summary = response.routes[0].summary;
            var leg = legs[0];
            var distance = leg.distance.text;
            var meters = leg.distance.value;
            var duration = leg.duration.text;
//          console.log( "distance = " + distance );
//          console.log( "duration = " + duration );

        	directions_renderer.setMap( map );
        	directions_renderer.setDirections( response );

            var xroute = response.routes[0];
            var location_from = new Object();
            var location_to = new Object();

            // For each route, display summary information.
            var path = xroute.overview_path;
            var legs = xroute.legs;

            // Markers
            var dist_meters = 0;
            var duration_secs = 0;
            console.log("legs.length=" + legs.length);
            route_bounds = new google.maps.LatLngBounds();
            polylines = [];
            legs_bounds = [];
            for ( i = 0; i < legs.length; i++) {

				legs_bounds[i] = new google.maps.LatLngBounds();
	            polylines[i] = new google.maps.Polyline({
	                path: [],
	                strokeColor: '#FF8000',
	                strokeWeight: 3
	            });
	
                dist_meters += legs[i].distance.value;
                duration_secs += legs[i].duration.value;
                var steps = legs[i].steps;
                console.log( i + ": m=" + legs[i].distance.value + " secs=" + legs[i].duration.value + " - len=" + steps.length );
                if ( i == 0 ) {
                    location_from.latlng  = legs[i].start_location;
                    location_from.address = legs[i].start_address;
                }
                location_to.latlng  = legs[i].end_location;
                location_to.address = legs[i].end_address;

                for ( var j = 0; j < steps.length; j++) {
                    var nextSegment = steps[j].path;
                    for ( var k=0; k < nextSegment.length;k++) {
                        polylines[i].getPath().push(nextSegment[k]);
                        legs_bounds[i].extend(nextSegment[k]);
                        route_bounds.extend(nextSegment[k]);
                    }
                }
                
				show_route_distance_duration(legs[i].distance.value, legs[i].duration.value, i+1);
            }
            
            show_route_distance_duration(dist_meters, duration_secs, undefined, summary);

			polylines.forEach( function(e) { e.setMap(map); })
			show_all_routes(); 

    		dijit.byId('id_input_route').set( 'disabled', true );
    		
    		dijit.byId('id_btn_pause').set( 'disabled', true );

        }
        else {
        	
		    dijit.byId("id_pane_standby").hide();

        	var message = "?";
            if ( status == google.maps.DirectionsStatus.UNKNOWN_ERROR )
            	message = "A directions request could not be processed due to a server error. The request may succeed if you try again.";
            else if ( status == google.maps.DirectionsStatus.OVER_QUERY_LIMIT )
            	message = "The webpage has gone over the requests limit in too short a period of time.";
            else if ( status == google.maps.DirectionsStatus.NOT_FOUND )
            	message = "At least one of the origin, destination, or waypoints could not be geocoded.";
            else if ( status == google.maps.DirectionsStatus.REQUEST_DENIED )
            	message = "The webpage is not allowed to use the directions service.";
            else if ( status == google.maps.DirectionsStatus.ZERO_RESULTS )
            	message = "No route could be found between the origin and destination.";
            else if ( status == google.maps.DirectionsStatus.INVALID_REQUEST )
            	message = "The DirectionsRequest provided was invalid.";
            show_error( message );

        }

    }

    function do_show_message( is_error, title, message ) {
    	
    	require(["dijit/Dialog", "dojo/domReady!"], function(Dialog){

    		message += "<hr>" +
    			"<div align='right'>" +
    			"<button dojoType='dijit/form/Button' type='button' onclick='dlg_error.hide()'>Ok</button>" +
    			"</div>";
    		
    		dlg_error = new Dialog({
    	        title: title,
    	        closable: false,
    	        duration:250,
    	        content: message,
    	        style: "min-width: 250px"
    	    });
    		
    		dlg_error.show();
    	});
    }
    
    function show_error( message ) {
    	do_show_message( true, "Error", message );
    }
    
    function show_message( title, message ) {
    	do_show_message( false, title, message );
    }
    
    function do_copy_message( title, message, text, is_gmaps_url ) {

    	require(["dijit/Dialog", "dojo/domReady!"], function(Dialog){

			if (typeof(dlg_copy_text) == 'undefined') {
				var d =  "<span id='id_create_url_msg'></span>" + 
					"<br>" +
					"<div id='id_is_gmaps_url' style='display:none'></div>" +
					"<p><textarea readonly rows=8 cols=120 class='js-copytextarea' style='width:100%' id='text_route_url'></textarea></p>" +
					"<br>" +
					"<hr>" +
					"<br>" +
					"<div align='right'>";
				d += "  <button dojoType='dijit/form/Button' type='button' onclick='require([\"RouteView.js\"], function( s ) { s.cb_copy_long_url_and_new_tab(); dlg_copy_text.hide(); })'>New Tab or Window</button>" +
					 "  <button dojoType='dijit/form/Button' type='button' onclick='require([\"RouteView.js\"], function( s ) { s.cb_copy_long_url(); dlg_copy_text.hide(); })'>Copy to Clipboard</button>" +
					 "  <button dojoType='dijit/form/Button' type='button' onclick='dlg_copy_text.hide(); '>Cancel</button>" +
					 "</div>";

				dlg_copy_text = new Dialog({
					title: title,
					closable: false,
					duration:250,
					content: d,
					style: "min-width:450px; min-heigh:350px"
				});
			}
    		
			document.getElementById('id_create_url_msg').innerHTML = message;
    		dlg_copy_text.show();
			document.getElementById('id_is_gmaps_url').innerHTML = (is_gmaps_url) ? "yes" : "no";
			document.getElementById('text_route_url').innerHTML = text;
    	});
    }

	function cb_map_pano_layout( layout ) {

		for ( var n = 1; n <= 4; n++ )
			dijit.byId('btn_map_pano_layout_'+n).set('selected', (n == layout) ? true : false, false);

		map_pano_layout = layout;
		localStorage.setItem( "map_pano_layout", map_pano_layout );

    	require(["dojo/dom-style"], function( domStyle ) {
			domStyle.set( "id_top_layout", "display", "none" );
			domStyle.set( "id_left_layout", "display", "none" );
			dijit.byId('app_layout').resize();
			set_map_pano_layout( );
		});

	}

    function cb_click_inc_dec_floating_pane(action, set) {
		console.log(action);
		var pegman_img_size = localStorage.getItem("map_pegman_img_size");
		if (!set)
	    	console.log( "  Restored pegman_img_size= " + pegman_img_size );
		if ( !pegman_img_size )
			pegman_img_size = 1;
		else
			pegman_img_size = parseInt(pegman_img_size);
		console.log( "pegman_img_size=" + pegman_img_size );
		pegman_img_size += action;
		console.log( "pegman_img_size=" + pegman_img_size );
		console.log(set);
		if (set)
			localStorage.setItem("map_pegman_img_size", pegman_img_size);
		require(["dojo/dom-style", "dojo/dom"], function( domStyle, dom) {
			switch (pegman_img_size) {
				case 1:
				default:
					domStyle.set( "id_floating_panorama_1", { width: "320px", height: "240px" } );
					domStyle.set( "id_floating_panorama_2", { width: "320px", height: "240px" } );
					break;
				case 2:
					domStyle.set( "id_floating_panorama_1", { width: "480px", height: "360px" } );
					domStyle.set( "id_floating_panorama_2", { width: "480px", height: "360px" } );
					break;
				case 3:
					domStyle.set( "id_floating_panorama_1", { width: "800px", height: "480px" } );
					domStyle.set( "id_floating_panorama_2", { width: "800px", height: "480px" } );
					break;
				case 4:
					domStyle.set( "id_floating_panorama_1", { width: "720px", height: "540px" } );
					domStyle.set( "id_floating_panorama_2", { width: "720px", height: "540px" } );
					break;
				case 5:
					domStyle.set( "id_floating_panorama_1", { width: "800px", height: "600px" } );
					domStyle.set( "id_floating_panorama_2", { width: "800px", height: "600px" } );
					break;
			}
		});
		if (action != 0) {
			google.maps.event.trigger( floating_panorama_1, 'resize' );
			google.maps.event.trigger( floating_panorama_2, 'resize' );
		}
		dijit.byId('btn_dec_floating_pano').set( 'disabled', (pegman_img_size == 1));
		dijit.byId('btn_inc_floating_pano').set( 'disabled', (pegman_img_size == 5));
	}
    
    function do_pause( ) {

console.log(curr_dist_in_route + " - " + step);
		if (interval == 10000) {
			cb_animate( curr_dist_in_route + step );
			return;
		}

        console.log( dijit.byId('id_btn_pause').get( 'label' ) );
        if ( dijit.byId('id_btn_pause').get( 'label' ) == "Pause" ) {
			if ( timer_animate != undefined ) { 
				clearTimeout( timer_animate );
				timer_animate = undefined;
			}				
	    	require(["dojo/dom-style", "dojo/dom-construct"], function( domStyle, domConstruct ) {
/*				
				if ( map_or_panorama_full_screen ) {
					domConstruct.place("td_map_canvas", "td_panoramas_canvas", "before");
		        	document.getElementById("td_map_canvas").style.width = "25%";
			        document.getElementById("td_panoramas_canvas").style.width = "75%";
					map_or_panorama_full_screen = false;
				}
*/
	    		dijit.byId('app_layout').resize();
		        google.maps.event.trigger( map, 'resize' );
			});
        	dijit.byId('id_btn_pause').set( 'label', "Continue" );
        }
        else if ( dijit.byId('id_btn_pause').get( 'label' ) == "Continue" ) {
        	dijit.byId('id_btn_pause').set( 'label', "Pause" );
			switch ((pano_cnt-1) % 3) {
				case 0 : 
					panorama.setPosition( pano_pos[2] );
					break;
				case 1 : 
					panorama.setPosition( pano_pos[3] );
					break;
				case 2 : 
					panorama.setPosition( pano_pos[4] );
					break;
			}
			if ( timer_animate != undefined )
				clearTimeout( timer_animate );
	       	timer_animate = setTimeout( function() { cb_animate(curr_dist_in_route); }, 250 );
        }

		dijit.byId('id_input_route').set( 'disabled', false );
		dijit.byId('id_input_route').set( 'intermediateChanges', true );
    }

    function do_stop( ) {

		document.getElementById("id_panorama2").style.display = "none";
		document.getElementById("id_panorama3").style.display = "none";
		document.getElementById("id_panorama4").style.display = "none";

		if ( timer_animate != undefined ) {
			clearTimeout( timer_animate );
			timer_animate = undefined;
		}

    	require(["dojo/dom-style", "dojo/dom-construct"], function( domStyle, domConstruct ) {
			domStyle.set( "id_top_layout", "display", "" );
			domStyle.set( "id_left_layout", "display", "table-cell" );
    		document.getElementById("td_map_canvas").style.width = "100%";
            document.getElementById("td_panoramas_canvas").style.width = "0%";
			if ( !map_or_panorama_full_screen ) {
				domConstruct.place("td_panoramas_canvas", "id_hidden", "after");
				map_or_panorama_full_screen = true;	
			}
			else {
				domConstruct.place("td_map_canvas", "td_panoramas_canvas", "before");
				domConstruct.place("td_panoramas_canvas", "td_map_canvas", "after");
				map_or_panorama_full_screen = false;
			}
    		dijit.byId('app_layout').resize();
	        google.maps.event.trigger( map, 'resize' );
		});
    	
		panorama2.setVisible( false );
		panorama3.setVisible( false );
		panorama4.setVisible( false );

		dijit.byId('id_btn_pause').set( 'disabled', true );
    	dijit.byId('id_btn_pause').set( 'label', "Pause" );
		dijit.byId('id_btn_stop').set( 'disabled', true );
		dijit.byId('id_btn_map_pano_layout').set( 'disabled', true );
	
		dijit.byId('id_input_route').set( 'disabled', true );
		dijit.byId('id_input_route').set( 'intermediateChanges', false );
		
        map.setOptions({draggableCursor: 'crosshair'});

		show_all_routes();

		if (directions_renderer != undefined)
			directions_renderer.setOptions( { zIndex:99, draggable: true } );
	       	
		marker_pos_using_slider.setMap( null );
		marker_pos_using_slider_no_pano.setMap( null );
    
		google.maps.event.clearListeners(panorama, "pano_changed");
    
		marker_browser_images_pos.setMap( null );
		google.maps.event.clearListeners(map, "click");
		google.maps.event.addListener( map, "click", function( evt ) {
			cb_map_click(evt);
		});

		if ( streetViewLayer.getMap() != undefined )
			streetViewLayer.setMap( null );

		require(["dojo/dom", "dojo/on", "dojo/dom-style"], function( dom, on, domStyle ) {
			domStyle.set( "td_streetview_panel", "display", "none" );
		});
		if ( timer_show_pano_on_mousemove != undefined ) {
			clearTimeout(timer_show_pano_on_mousemove);
			timer_show_pano_on_mousemove = undefined;
		}
		marker_browser_images_pos.setMap( null );
    }

    function start( ) {

    	require(["dojo/dom", "dojo/on", "dojo/dom-style", "dojo/dom-geometry", "dojo/store/Memory", "dojo/ready"], function( dom, on, domStyle, domGeom, Memory, ready ) {
            ready( function() {

				console.log("DOJO version: " + dojo.version);

   				load_settings( );
				
				var google_api = "";
				console.log(location.hostname);
				//if ( location.hostname == "127.0.0.1" )
				//	google_api = "weekly";
				//else
				google_api = "quarterly";
				console.log(google_api);
				var rq;
				if (google_api != "")
					rq = "//maps.google.com/maps/api/js?v="+google_api+"&libraries=places,geometry";
				else
					rq = "//maps.google.com/maps/api/js?libraries=places,geometry";
		    	var google_maps_api_key = localStorage.getItem("id_google_maps_api_key");
		    	if ( google_maps_api_key && (google_maps_api_key != "") )
					rq += "&key=" + google_maps_api_key;
				require([rq], function( ) {
					require(["v3_epoly.js"], function( ) {
						require(["RouteView.js", "dojo/domReady!"], function( ) {
			 				initialize( );
						});
					});
				});
   				
   			});
		});
	}

	function create_route_dlg() {
	
		require(["dojo/dom-construct", "dijit/form/TextBox", "dijit/form/Button", "dijit/form/ToggleButton", "dijit/Tooltip", "dojo/dom-style"], function(domConstruct, TextBox, Button, ToggleButton, Tooltip, domStyle) {
			
			for (var n = 0; n < MAX_NB_WAYPOINTS+2; n++) { 

				var id_tr = domConstruct.create("tr", { 
					id: "id_tr_"+n,
					style: "display:" + ((n < 2) ? "" : "none") 
				}, "id_table_route", "last");
				var id_label_wp = "id_label_wp_"+n;
				domConstruct.create("td", { innerHTML:String.fromCharCode(n+65)+"&nbsp;", align:"right", valign:"middle", id:id_label_wp}, id_tr, "first");

				var id_td2 = domConstruct.create("td", { align:"left", valign:"middle"}, id_tr, "last");
				var input = new TextBox({
					id: "id_wp_"+n,
					type: "text", 
					style: "width:22em", 
					trim: true,
					intermediateChanges: false,
					selectOnClick: true,
					onKeyPress: function(evt) { cb_waypoint_changed(this.id, evt); },
//					onKeyPress: function(evt) { console.log(evt); domStyle.set( this.id, { color: "red" } ); },
					['waypoint_index']: n 
				}, id_td2, "last");

				var id_td3 = domConstruct.create("td", { 
					align:"right", 
					valign:"middle"
				}, id_tr, "last");
				var btn_add = new Button({
					iconClass: "icon_btn_add",
					showLabel: false,
					onClick: function() { cb_click_btn_add(this.waypoint_index+1); },
					id: "id_btn_add_"+n,
					disabled: true,
					waypoint_index: n,
					style: "font-size: 75%"
				}, id_td3); 

				new Tooltip({
					id: ["id_tooltip_btn_add_"+n],
					connectId: ["id_btn_add_"+n],
					position:['below-centered'],
					label: "Create a new Waypoint",
					showDelay:999999,
					hideDelay:0
				});

				var id_td4 = domConstruct.create("td", { 
					align:"right", 
					valign:"middle"
				}, id_tr, "last");
				var btn_remove = new Button({
					iconClass: "icon_btn_remove",
					showLabel: false,
					onClick: function() { cb_click_btn_remove(this.waypoint_index); },
					id: "id_btn_remove_"+n,
					disabled: true,
					waypoint_index: n,
					style: "font-size: 75%"
				}, id_td4);

				new Tooltip({
					id: "id_tooltip_btn_remove_"+n,
					connectId: ["id_btn_remove_"+n],
					position:['below-centered'],
					label: "Delete the Waypoint",
					showDelay:999999,
					hideDelay:0
				});

				var id_td5 = domConstruct.create("td", { 
					align:"right", 
					valign:"middle"
				}, id_tr, "last");
				var btn_up = new Button({
					iconClass: "icon_btn_up",
					showLabel: false,
					onClick: function() { cb_click_btn_up(this.waypoint_index); },
					id: "id_btn_up_"+n,
					disabled: true,
					waypoint_index: n,
					style: "font-size: 75%"
				}, id_td5);

				new Tooltip({
					id: ["id_tooltip_btn_up_"+n],
					connectId: ["id_btn_up_"+n],
					position:['below-centered'],
					label: "Move the Waypoint up",
					showDelay:999999,
					hideDelay:0
				});

				var id_td6 = domConstruct.create("td", { 
					align:"right", 
					valign:"middle"
				}, id_tr, "last");
				var btn_down = new Button({
					iconClass: "icon_btn_down",
					showLabel: false,
					onClick: function() { cb_click_btn_down(this.waypoint_index); },
					id: "id_btn_down_"+n,
					disabled: "true",
					waypoint_index: n,
					style: "font-size: 75%"
				}, id_td6);

				new Tooltip({
					id: ["id_tooltip_btn_down_"+n],
					connectId: ["id_btn_down_"+n],
					position:['below-centered'],
					label: "Move the Waypoint down",
					showDelay:999999,
					hideDelay:0,
				});

				var tooltip = new Tooltip({
					id: "gps_loc_wp_"+n,
					connectId: ["id_wp_"+n],
					position:['after-centered'],
					showDelay:650,
					hideDelay:0
				});
			}

			for (var n = 1; n < MAX_NB_WAYPOINTS+2; n++) {
			
				var id_tr = domConstruct.create("tr", { 
					id: "id_drive_tr_"+n,
					style: "display:" + ((n < 2) ? "" : "none") 
				}, "id_table_drive", "last");
				
				var id_td = domConstruct.create("td", { align:"right", valign:"middle"}, id_tr, "last");
				
				var btn_drive = new Button({
					iconClass: "icon_btn_drive",
					showLabel: false,
					onClick: function() { cb_click_btn_drive(this.waypoint_index); },
					id: "id_btn_drive_"+n,
					disabled: true,
					waypoint_index: n-1,
					style: "font-size: 75%"
				}, id_td);

				new Tooltip({
					id: "id_tooltip_btn_drive_"+n,
					connectId: ["id_btn_drive_"+n],
					position:['after-centered'],
					label: "",
					showDelay:9999999,
					hideDelay:0
				});

			}
	
		});
	}
	
	function show_clear_place() {
        var do_show  = dijit.byId('id_btn_show_place').get( 'checked' );
		if (do_show)
			show_place();
		else
			clear_place();

	}

	function clear_place() {

		console.log( search_places.length );
		search_places.forEach( function(e) {
			//console.log( e );
			e.setMap( null );
			delete e;
		})
		search_places = [];
		console.log( search_places.length );
		
    	var dlg = dijit.byId('id_places_dlg');
    	dlg.closeDropDown( false );
	}
	
	function show_place( ) {

		clear_place( );

		var place_val = document.getElementById("id_place").value;
		console.log( place_val );
		var infowindow = new google.maps.InfoWindow();
		
		function createMarker(place) {
			var marker = new google.maps.Marker({
				map: map,
				position: place.geometry.location,
				LatLng: place.geometry.location,
				icon: "icons/marker_flag.png",
				title: place.name + "\n" + place.formatted_address
			});
			search_places.push( marker );

  			google.maps.event.addListener(marker, 'click', function() {
				if (place.photos.length == 0)
					infowindow.setContent(place.name + "<BR>" + place.formatted_address + "<BR><BR><a href='#' onclick='require([\"RouteView.js\"], function(s) { s.add_place(\"" + escape(place.name) + "\", \"" + escape(place.formatted_address)+"\"); })'>Add this place at the end of the route</a><br>");
				else
					//console.log(place.photos[0].getUrl());
					infowindow.setContent(place.name + "<BR>" + place.formatted_address + "<BR><BR><a href='#' onclick='require([\"RouteView.js\"], function(s) { s.add_place(\"" + escape(place.name) + "\", \"" + escape(place.formatted_address)+"\"); })'>Add this place at the end of the route</a><br><br><img src='"+place.photos[0].getUrl()+"' style='width:320px;height:240px'><br>");
				infowindow.setPosition(place.geometry.location);
				infowindow.open(map, marker);
			});
		}
      
      	function callback(results, status) {
			if (status === google.maps.places.PlacesServiceStatus.OK) {
				console.log("found: "+results.length);
				for (var i = 0; i < results.length; i++) {
					//console.log(results[i]);
					createMarker(results[i]);
				}
			}
		}

		var bounds = map.getBounds();

		api_counts[api_count.PLACES]++;
		var service = new google.maps.places.PlacesService(map);
        service.textSearch({
			bounds: bounds,
			query: place_val
        }, callback);
		
    	var dlg = dijit.byId('id_places_dlg');
    	dlg.closeDropDown( false );
		
	}

	function update_place(where, gps) {
		console.log(where);
		console.log(gps);
		var geocoder = new google.maps.Geocoder();
    	geocoder.geocode( where, function( results, status ) {
			api_counts[api_count.GEOCODING]++;
    	    if (status === google.maps.GeocoderStatus.OK) {
    	    	console.log( results[0] );
    	    	console.log( places );
    	        var first_hidden = find_first_hidden( );
    	        console.log( "first_hidden=" + first_hidden );
    	        if ( first_hidden != (MAX_NB_WAYPOINTS + 2) ) {
					(function ( waypoint_index ) {
						api_counts[api_count.PLACES]++;
						service.getDetails({
							placeId: results[0].place_id
						}, function ( place, status ) {
							console.log( " --> " + waypoint_index );
							if ( status == google.maps.places.PlacesServiceStatus.OK ) {
								places[waypoint_index] = place;
								var new_nb_waypoints = waypoint_index;
								cb_click_btn_add( new_nb_waypoints )
								var id = "id_wp_" + waypoint_index;
								if (gps == undefined)
									dijit.byId( id ).set( "value", place.formatted_address );
								else
									dijit.byId( id ).set( "value", gps.slice(1, -1) );
								require(["dojo/dom-style"], function( domStyle) {
									domStyle.set( "id_wp_"+waypoint_index, { color: "black" } );
								});
								update_btns_remove_up_down( );
								do_route( true );
							}
						});
					})( first_hidden );
    	        }
    	    }
    	});
	}

	function add_place(name, formatted_address) {
		console.log("name="+unescape(name));
		console.log("formatted_address="+unescape(formatted_address));
		var first_hidden = find_first_hidden( );
		update_place({'address': unescape(name)+" , " +unescape(formatted_address)});
		do_route( true );
	}

	function decode_url_params() {
	
		var query = location.search.substr(1);
	  	var result = [];
	  	
	  	var play_waypoint = undefined;

		var total_nb_waypoints = 0;
		var nb_routes = 0;
		query.split("route=").forEach(function(part) {
			if ( part != "" ) {
				var item = part;
				console.log( part );
				part.split("&").forEach(function(part) {
					var item = part;
					console.log(item);
					if (item != "") {
						if ( item.slice(0,5) == "play=" ) {
							var p = item.slice(5);
							console.log( p );
							play_waypoint = parseInt( p );
							console.log("play_waypoint=" + play_waypoint);
							localStorage.setItem( "initial_info_use_icon", "true" );
						}
						else if ( item.slice(0,7) == "interv=" ) {
							var p = item.slice(7);
							console.log( p );
							var q = p.split(",");
							console.log(q);
							if ( q.length = 2 ) {
								step = parseInt( q[0] );
								interval = parseInt( q[1] );
								console.log( "step=" + step );
								console.log( "interval=" + interval );
							}
						}
						else {
							result.push( decodeURIComponent(item) );
							console.log( decodeURIComponent(item) );
							total_nb_waypoints++;
						}
					}
				});	
				nb_routes++;
			}
	  	});	
	  	if (nb_routes == 0)
			return false;

	    dijit.byId("id_pane_standby").show();

	  	console.log(result);
		var waypoints = [];
		for ( var waypoint_index = 0; waypoint_index < result.length; waypoint_index++ ) {
			require(["dojo/dom-style"], function( domStyle) {
				dijit.byId('id_wp_'+waypoint_index).set( 'value', result[waypoint_index] );
				domStyle.set( 'id_wp_'+waypoint_index, { color: "red" } );
				show_waypoint( waypoint_index );
				if ( waypoint_index >= 1 ) {
					dijit.byId('id_btn_drive_'+waypoint_index).set( 'disabled', false );
					domStyle.set( 'id_tr_'+(waypoint_index), "display", "" );
					domStyle.set( 'id_drive_tr_'+(waypoint_index), "display", "" );
					dijit.byId('id_btn_drive_whole_route').set( 'disabled', false );
				}
			});
		}
		update_btns_remove_up_down( );
		
		(function ( total_nb_waypoints ) {
			console.log( "total_nb_waypoints=" + total_nb_waypoints );
			var done_nb_waypoints = 0;
			var set_ti = 250;
			for ( var waypoint_index = 0; waypoint_index < result.length; waypoint_index++ ) {
				
				function look_for_address( place_name, waypoint_index) {
					var geocoder = new google.maps.Geocoder();
					geocoder.geocode( { 'address': place_name}, function(results, status) {
						api_counts[api_count.GEOCODING]++;
						if ( status == google.maps.GeocoderStatus.OK ) {
//							console.log( results);
							api_counts[api_count.PLACES]++;
							service.getDetails({
								placeId: results[0].place_id
							}, function ( place, status ) {
								if ( status == google.maps.places.PlacesServiceStatus.OK ) {
									console.log( done_nb_waypoints + " / " + total_nb_waypoints + " , " + waypoint_index + " --> " + place_name );
									is_dirty = true;
									places[waypoint_index] = place;
									require(["dojo/dom-style"], function( domStyle) {
										domStyle.set( 'id_wp_'+waypoint_index, { color: "black" } );
									});
									done_nb_waypoints++;
									if ( waypoint_index == 0 )
										map.setCenter(results[0].geometry.location);
									if ( done_nb_waypoints == total_nb_waypoints ) {
										do_route( false );
										dijit.byId("id_pane_standby").hide();
										if ( play_waypoint != undefined ) {
											console.log( "play_waypoint="+play_waypoint);
											curr_leg = play_waypoint;
											(function ( play_waypoint ) {
												function play_route_at_startup() {
													if ( (polylines == undefined) || (polylines[play_waypoint] == undefined))
														setTimeout( function() { play_route_at_startup(); }, 250 );
													else
														cb_click_btn_drive( play_waypoint );
												}
												setTimeout( function() { play_route_at_startup(); }, 250 );
											})( play_waypoint );
										}
									}
								}
							});
						} 
						else {
							console.log("Geocode was not successful for [" + place_name + "]: " + status);
						}
					});
				}
				(function ( result, waypoint_index ) {
					setTimeout( function() { look_for_address( result, waypoint_index ); }, set_ti );
				})( result[waypoint_index], waypoint_index );
				set_ti += 750;
			}
		})( total_nb_waypoints );

		console.log("step="+step);
		console.log("interval="+interval);
	  	return true;
	}
	
    function is_full_screen_supported( ) {

    	var d = document.getElementById("id_body");
    	if ( document.exitFullscreen || document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen )
    		return true;

    	return false;
    }

    function is_in_full_screen( ) {
		if ( !window.screenTop && !window.screenY )
			return true;
		else
			return false; 
    }

    function panorama_resize( ) {
		require(["dojo/dom-geometry", "dojo/dom", "dojo/dom-style"], function( domGeom, dom, domStyle ) {
			
			var node = dom.byId("td_panoramas_canvas");
			var computedStyle = domStyle.getComputedStyle(node);
			var output = domGeom.getContentBox(node, computedStyle);
//			console.log( output );

			var box = { w: output.w, h: output.h };
			var node = dom.byId( "id_panorama2" );
			var computedStyle = domStyle.getComputedStyle(node);
			domGeom.setContentSize(node, box, computedStyle);

			var box = { w: output.w, h: output.h };
			var node = dom.byId( "id_panorama3" );
			var computedStyle = domStyle.getComputedStyle(node);
			domGeom.setContentSize(node, box, computedStyle);

			var box = { w: output.w, h: output.h };
			var node = dom.byId( "id_panorama4" );
			var computedStyle = domStyle.getComputedStyle(node);
			domGeom.setContentSize(node, box, computedStyle);

		});
	}
    
    function show_hide_route_panel(do_hide) {
		require(["dojo/dom-style"], function( domStyle ) {
			if (do_hide) {
				domStyle.set( "id_top_layout", "display", "none" );
				domStyle.set( "id_control_route", "display", "none" );
				domStyle.set( "id_left_layout", "display", "none" );
}
			else {
				domStyle.set( "id_top_layout", "display", "" );
				domStyle.set( "id_control_route", "display", "" );
				domStyle.set( "id_left_layout", "display", "" );
			}
		});
		dijit.byId('app_layout').resize();
	}
    
	function cb_streetview_icon() {
		
		if (timer_animate != undefined)
			return;

		var btn_drive_whole_route_disabled = dijit.byId('id_btn_drive_whole_route').get( 'disabled' );
		if ( streetViewLayer.getMap() != undefined ) {
			console.log("pegman is unselected - " + btn_drive_whole_route_disabled);
			show_hide_route_panel(false);
			require(["dojo/dom", "dojo/on", "dojo/dom-style"], function( dom, on, domStyle ) {
				domStyle.set( "td_streetview_panel", "display", "none" );
			});
			if ( timer_show_pano_on_mousemove != undefined ) {
				clearTimeout(timer_show_pano_on_mousemove);
				timer_show_pano_on_mousemove = undefined;
			}
			streetViewLayer.setMap( null );
			if (btn_drive_whole_route_disabled)
				map.setOptions( {draggableCursor:null} );
			else
				map.setOptions( {draggableCursor:'crosshair'} );
			require(["dojo/dom-style"], function( domStyle ) {
				var display = domStyle.get( "id_top_layout", "display" );
				console.log(display);
				if (display != "block")
					do_stop();
			});
		}
		else {
			console.log("pegman is selected - " + btn_drive_whole_route_disabled);
			show_hide_route_panel(true);
			require(["dojo/dom", "dojo/on", "dojo/dom-style"], function( dom, on, domStyle ) {
				domStyle.set( "td_streetview_panel", "display", "" );
			});
			streetViewLayer.setMap( map );
			google.maps.event.trigger( floating_panorama_1, 'resize' );
			google.maps.event.trigger( floating_panorama_2, 'resize' );
			map.setOptions({draggableCursor: 'context-menu'});
			var initial_info_use_pegman = localStorage.getItem("initial_info_use_pegman");
			if ( !initial_info_use_pegman ) {
				do_show_message( false, "StreetView Images Browser", 
					"<div align='center'>" +
					"When the pegman is selected, you will see a StreetView image<br>" +
					"when you move the cursor over any road which has StreetView coverage<br>" +
					"(roads displayed in blue).<br><br>" +
					"<b>Use the CTRL key if you want to reach an area of the map or the screen<br>" +
					"without showing a StreetVide image.</b></br><br>" +
					"Click again on the <b>pegman icon</b> or the <b>Stop button</b> to leave this mode.<br>" +
					"</div>" );
				localStorage.setItem( "initial_info_use_pegman", "true" );
			}
		}
	}

    function initialize( ) {

    	require(["dojo/dom", "dojo/on", "dojo/dom-style", "dojo/dom-geometry", "dojo/store/Memory", "dojo/ready"], 
    		function( dom, on, domStyle, domGeom, Memory, ready ) {
    		
            ready( function() {

				console.log("Google Maps API version: " + google.maps.version);

				is_ff = false;
				require(["dojo/sniff"], function( has ){
					console.log( "has(ie) = " + has("ie") );
					if ( has("ff") )
						is_ff = true;
					if ( has("ie") <= 8 ) {
						do_show_message( false, "Error!", "Sorry IE is not supported!\n\nPlease use either Chrome, Firefox or Edge" );
					}
				});

				var url = location.host + location.pathname;
				console.log( "url= [" + url + "]" );
				if ( url == "rawgit.com/osingla/RouteView/master/RouteView.html" ) {
					console.log( "Switching to http://streetviewplayer.org/VirtualRide" );
					document.location.href = newUrl = "http://StreetViewPlayer.org";
   				}

				var map_options = {
					disableDoubleClickZoom: true,
					fullscreenControl: false,
					draggable: true,
                   	zoom: 14,
                   	clickableIcons: false,
                   	keyboardShortcuts: false,
                   	rotateControl: false,
                   	scaleControl: true,
                   	scrollwheel: true,
                   	zoomControl: true,
                   	mapTypeControl: false,
                   	streetViewControl: false,
                   	gestureHandling: 'greedy',
                   	mapTypeId: 'roadmap'
                };
                map = new google.maps.Map( document.getElementById('id_map_canvas'), map_options );

				function CenterControl(controlDiv, map) {

					var controlUI = document.createElement('div');
					controlUI.style.backgroundColor = '#dfdfdf';
					controlUI.style.borderRadius = '1px';
					controlUI.style.boxShadow = '0 1px 3px rgba(0,0,0,.3)';
					controlUI.style.cursor = 'move';
					controlUI.style.marginBottom = '1px';
					controlUI.style.textAlign = 'center';
					controlUI.title = 'Show the Street View available.\n\nOnce StreetView is enabled, when moving the cursor over a StreetView enabled road,\ntthis will show you the panorama for this area.';
					controlDiv.appendChild(controlUI);

					var controlText = document.createElement('div');
					controlText.style.lineHeight = '1px';
					controlText.style.paddingLeft = '1px';
					controlText.style.paddingRight = '1px';
					controlText.innerHTML = 
						"<img onclick=\"require(['RouteView.js'], function( s ) { s.cb_streetview_icon(); })\" src='icons/streetview-icon.png' width=32 height=32>";
					controlUI.appendChild(controlText);
				}
      
				var centerControlDiv = document.createElement('div');
				var centerControl = new CenterControl(centerControlDiv, map);

				centerControlDiv.index = 1;
				map.controls[google.maps.ControlPosition.TOP_CENTER].push(centerControlDiv);
        
   				create_route_dlg();

				require(["dojo/dom", "dojo/on", "dojo/dom-style"], function( dom, on, domStyle ) {
					for (var n = 0; n < MAX_NB_WAYPOINTS+2; n++) { 
						(function (n) {
							var id_label_wp = "id_label_wp_"+n;
							on( dom.byId(id_label_wp), "click", function( evt ) {
//							console.log("XX: "+n);
							});
						})(n);
					}
				});

			    require(["RouteViewMapStyles.js"], function( s ) { 
			    	var map_style = dom.byId('id_map_style').value;
			    	if ( map_style != "" )
			    		s.set_map_style( map, parseInt( map_style ) ); 
			    });

                service = new google.maps.places.PlacesService( map );
                
   				marker_small_street_view = new google.maps.Marker({
					map: map,
					title: 'Current position',
					icon: "icons/marker_pegman.png"
				});

   				marker_no_street_view = new google.maps.Marker({
					map: map,
					title: 'No Street View available',
					icon: "http://www.google.com/mapfiles/arrow.png"
				});

				marker_pos_using_slider = new google.maps.Marker({
					map: map,
					title: 'Position along the route using the slider',
					icon: "icons/marker_pos_using_slider.png"
				});

				marker_browser_images_pos = new google.maps.Marker({
					map: map,
					title: 'Position to show panorama view',
					icon: "icons/marker_browse_images_pos.png"
				});

				marker_pos_using_slider_no_pano = new google.maps.Marker({
					map: map,
					title: 'Position along the route using the slider',
					icon: "icons/marker_pos_using_slider_no_pano.png"
				});

				streetViewLayer = new google.maps.StreetViewCoverageLayer();

                var panorama_options = {
                    pov: {
                        heading: 34,
                        pitch: 10
                    },
                    enableCloseButton: false,
                    linksControl: false,
                    panControl: true,
                    zoomControl: false,
                    clickToGo: false,
                    disableDoubleClickZoom: true,
                    fullscreenControl: false,
                    showRoadLabels: false,
                    imageDateControl: false
                };

                var floating_panorama_options = {
                    pov: {
                        heading: 34,
                        pitch: 10
                    },
                    enableCloseButton: false,
                    linksControl: false,
                    panControl: true,
                    zoomControl: false,
                    clickToGo: false,
                    disableDoubleClickZoom: true,
                    fullscreenControl: false,
                    showRoadLabels: false,
                    imageDateControl: false
                };

                panorama = new google.maps.StreetViewPanorama( document.getElementById('id_panorama'), panorama_options );
				map.setStreetView( panorama );
				panorama2 = new google.maps.StreetViewPanorama( document.getElementById('id_panorama2'), panorama_options );
				map.setStreetView( panorama2 );
				panorama3 = new google.maps.StreetViewPanorama( document.getElementById('id_panorama3'), panorama_options );
				map.setStreetView( panorama3 );
				panorama4 = new google.maps.StreetViewPanorama( document.getElementById('id_panorama4'), panorama_options );
				map.setStreetView( panorama4 );

				floating_panorama_1 = new google.maps.StreetViewPanorama( document.getElementById('id_floating_panorama_1'), floating_panorama_options );
				floating_panorama_2 = new google.maps.StreetViewPanorama( document.getElementById('id_floating_panorama_2'), floating_panorama_options );

                window.onresize = function(event) {
					panorama_resize( );
				};
                
            	map_or_panorama_full_screen = false;

        		google.maps.event.addListener( map, "click", function(evt) {
        			cb_map_click(evt);
       			});

        		google.maps.event.addListener( map, "dragend", function() {
        			console.log(this);
					var do_show  = dijit.byId('id_btn_show_place').get( 'checked' );
					if (do_show)
						show_place();
       			});

				google.maps.event.addListener(map, "mousemove", function(evt) {
					function mouse_move(evt) {
						street_view_check.getPanoramaByLocation(evt.latLng, 1000, (function() { return function(result, status) {
							if (status == google.maps.StreetViewStatus.ZERO_RESULTS) {
							}
							else {
								if (result.links.length >= 1) {
									heading = result.links[0].heading;
									floating_panorama_1.setPov( { heading: heading, pitch: 1 } );
									floating_panorama_1.setPosition(result.location.latLng);
									marker_browser_images_pos.setPosition(result.location.latLng);
									if (result.links.length > 1) {
										heading = result.links[1].heading;
										floating_panorama_2.setPov( { heading: heading, pitch: 1 } );
										floating_panorama_2.setPosition(result.location.latLng);
									}
								}
							}
						}})());
					}
					if (streetViewLayer.getMap() != undefined) {
						if ( dijit.byId("id_btn_stop").get("disabled") ) {
							try {
								if (!evt.ub.ctrlKey) {
									if ( timer_show_pano_on_mousemove != undefined ) 
										clearTimeout(timer_show_pano_on_mousemove);
									if ( streetViewLayer.getMap() != undefined )
										timer_show_pano_on_mousemove = setTimeout(mouse_move, 250, evt);
								}
							} catch (err) {
								try {
									if (!evt.vb.ctrlKey) {
										if ( timer_show_pano_on_mousemove != undefined ) 
											clearTimeout(timer_show_pano_on_mousemove);
										if ( streetViewLayer.getMap() != undefined )
											timer_show_pano_on_mousemove = setTimeout(mouse_move, 250, evt);
									}
								} catch (err) {
								    try {
									    if (!evt.domEvent.ctrlKey) {
										    if ( timer_show_pano_on_mousemove != undefined ) 
											    clearTimeout(timer_show_pano_on_mousemove);
										    if ( streetViewLayer.getMap() != undefined )
											    timer_show_pano_on_mousemove = setTimeout(mouse_move, 250, evt);
									    }
								    } catch (err) {
									    console.log(evt);
								    }
								}
							}
						}
					}
				});

				google.maps.event.clearListeners( map, 'rightclick' );
        		google.maps.event.addListener( map, "rightclick", function( evt ) {
        			cb_map_rightclick(evt);
       			});
        		
            	var id_panorama2 = dom.byId('id_panorama2');
        		on( id_panorama2, "dblclick", function( evt ) {
//					console.log( evt );
//     				if ( evt.handled == true )
//     					cb_panorama_dblclick( );
       			});
            	var id_panorama3 = dom.byId('id_panorama3');
        		on( id_panorama3, "dblclick", function( evt ) {
// 					cb_panorama_dblclick( );
       			});
            	var id_panorama4 = dom.byId('id_panorama4');
        		on( id_panorama4, "dblclick", function( evt ) {
// 					cb_panorama_dblclick( );
       			});

				street_view_check = new google.maps.StreetViewService( );

		    	var google_maps_api_key = localStorage.getItem("id_google_maps_api_key");
				if ( !google_maps_api_key ) {
					domStyle.set( "id_no_google_maps_api", "display", "" );
					do_show_message( false, "Warning!", 
						"<div align='center'>" +
						"  <b>You do not have provided a Google Maps API Key.</b><br>" +
						"<br>Beginning on June 11, 2018, Google <b>requires</b> to use a valid API key" +
						"<br>for all Google Maps projects. Since I can not afford to have my personal" +
						"<br>key to be used here by everbody using this free program, your only option is" +
						"<br>to request a google maps api key and use it here (see configuration panel)." +
						"<br>" +
						"<div align='left'>" +
						"<br>Notes:<br>" +
						"<ol>" +
                        "<li>Your API keys needs to support these APIs:</li>" +
                        "  <ul>" +
                        "    <li>Directions API</li>" +
                        "    <li>Places API</li>" +
                        "    <li>Geocoding API</li>" +
                        "    <li>MAPS Javascrip API</li>" +
                        "  </ul>" +
						"<li>Your key is saved locally and <b>not shared</b> anywhere.</li>" +
						"<li>Unless you use this program 24/7, it's very unlikely you will generate enough<br>" +
						"   traffic to be billed by Google. I use this program a lot with my own Google Maps<br>" +
						"   API key and I am VERY far to be billed.</li>" +
						"</ol>" +
						"<div align='center'>" +
						"<b>Without a Google Maps API this program is not usable.</b>" +
						"</div>" +
						"<br>" +
						"<hr>" +
						"<a href='https://developers.google.com/maps/faq' target='_blank'>https://developers.google.com/maps/faq</a><br>" +
						"<a href='https://developers.google.com/maps/documentation/javascript/get-api-key' target='_blank'>https://developers.google.com/maps/documentation/javascript/get-api-key</a>" +
						"<br>" +
						"</div>" +
						"</div>" );
				}

        		_list_countries = [
        		    {id: 0,    list:['Algeria','Burkina Faso','Faeroe Islands','Ghana','Guinea Republic','Iceland','Ireland','Ivory Coast','Liberia','Mali','Morocco','Sao Tome and Principe','Senegal','Sierra Leone','Saint Helena','Gambia','Togo','United Kingdom']},
        		    {id: 1,    list:['Albania','Andorra','Angola','Australia','Austria','Belgium','Benin','Bosnia','Cameroon','Central Africa Republic','Chad','Congo','Croatia','Czech Republic','Congo, Democratic Republic','Denmark','Equatorial Guinea','France','Gabon','Germany','Gibraltar','Guam','Hungary','Italy','Liechtenstein','Luxembourg','Macedonia (Fyrom)','Malta','Mariana Islands','Marshall Islands','Micronesia','Monaco','Netherlands','Niger','Nigeria','Norway','Papua New Guinea','Poland','Portugal','San Marino','Serbia','Slovakia','Slovenia','Spain','Sweden','Switzerland','Tunisia']},
        		    {id: -1,   list:['Cape Verde','Cook Islands','French Polynesia','Guinea Bissau','USA']},
        		    {id: 11,   list:['New Caledonia','Solomon Islands','Vanuatu']},
        		    {id: -11,  list:['Niue','American Samoa','Samoa','USA']},
        		    {id: 11.5, list:['Norfolk Island']},
        		    {id: 12,   list:['Fiji','Kiribati','Nauru','New Zealand','Tuvalu','Wallis and Futuna']},
        		    {id: 2,    list:['Botswana','Bulgaria','Burundi','Cyprus','Congo, Democratic Republic','Egypt','Finland','Greece','Israel','Jordan','Lebanon','Lesotho','Libya','Lithuania','Malawi','Mozambique','Namibia','Palestine','Romania','Rwanda','South Africa','Sudan','Swaziland','Syria','Turkey','Zambia','Zimbabwe']},
        		    {id: 3,    list:['Bahrain','Belarus','Comoros','Djibouti','Eritrea','Estonia','Ethiopia','Iraq','Kenya','Kuwait','latvia','Madagascar','Mayotte','Moldova','Qatar','Russia','Saudi Arabia','Somalia','Tanzania','Uganda','Ukraine','Yemen Arab Republic']},
        		    {id: -3,   list:['Argentina','Brazil','Cuba','Greenland','Guyana','Uruguay']},
        		    {id: 3.5,  list:['Iran']},
        		    {id: -3.5, list:['Surinam']},
        		    {id: 4,    list:['Armenia','Azerbaijan','Georgia','Mauritius','Oman','Reunion','Seychelles','United Arab Emirates']},
        		    {id: -4,   list:['Anguilla','Antigua and Barbuda','Aruba','Barbados','Bermuda','Bolivia','Brazil','Canada','Chile','Dominica','Dominican Republic','Falkland Islands (Malvinas)','French Guiana ','Grenada','Guadeloupe','Martinique','Montserrat','Netherlands Antilles','Paraguay','Puerto Rico','Saint Kitts and Nevis','Saint Lucia','Trinidad and Tobago','Venezuela']},
        		    {id: 5,    list:['Diego Garcia','Maldives Republic','Pakistan','Turkmenistan']},
        		    {id: -5,   list:['Bahamas','Brazil','Canada','Cayman Islands','Colombia','Ecuador','Haiti','Jamaica','Panama','Peru','Turks and Caicos Islands','USA']},
        		    {id: 5.5,  list:['Bhutan','India','Nepal','Sri Lanka']},
        		    {id: 6,    list:['Bangladesh','Kazakhstan','Kyrgyzstan','Tajikistan','Uzbekistan']},
        		    {id: -6,   list:['Belize','Canada','Costa Rica','El Salvador','Guatemala','Honduras','Mexico','Nicaragua','USA']},
        		    {id: 6.5,  list:['Myanmar']},
        		    {id: 7,    list:['Australia','Cambodia','Indonesia','Laos','Thailand','Vietnam']},
        		    {id: -7,   list:['Canada','Mexico','USA']},
        		    {id: 8,    list:['Australia','Brunei','China','Hong Kong','Indonesia','Macau','Malaysia','Mongolia','Philippines','Singapore','Taiwan']},
        		    {id: -8,   list:['Canada','Mexico','USA']},
        		    {id: 9,    list:['Australia','Indonesia','Japan','Korea','Palau']},
        		    {id: -9,   list:['USA']},
        		];
        		list_countries = new Memory({data: _list_countries});

        		iso_countries = new Memory({data: _iso_countries});

        		var list_all_countries_store = new Memory({ idProperty: "name", data: [ ], type: "separator" });
        		_iso_countries.forEach( function(entry) {
//	         		console.log( entry.id );
					if ( entry.id == "" )
        		    	list_all_countries_store.add( { name: entry.id, type: "separator" } );
					else
        		    	list_all_countries_store.add( { name: entry.id } );
        		});
        		
				var options = ' \
					<optgroup label="North America"> \
						<option value="US">USA</option> \
						<option value="CA">Canada</option> \
						<option value="MX">Mexico</option> \
					</optgroup> \
					<optgroup label="South America"> \
						<option value="CL">Chile</option> \
						<option value="BR">Brazil</option> \
					</optgroup> \
					<optgroup label="Europe"> \
						<option value="AD"Andorre</option> \
						<option value="AT"Austria</option> \
						<option value="BE">Belgium</option> \
						<option value="CH">Switzerland</option> \
						<option value="CZ">Czech Republic</option> \
						<option value="DK">Denmark</option> \
						<option value="DE">Germany</option> \
						<option value="FI">Finland</option> \
						<option value="FR">France</option> \
						<option value="GR">Greece</option> \
						<option value="HU">Hungury</option> \
						<option value="IE">Ireland</option> \
						<option value="IT">Italy</option> \
						<option value="LU">Luxembourg</option> \
						<option value="MC">Monaco</option> \
						<option value="NL">Netherlands</option> \
						<option value="NO">Norway</option> \
						<option value="PL">Poland</option> \
						<option value="PT">Portugal</option> \
						<option value="SE">Sweden</option> \
						<option value="GB">United Kingdom</option> \
					</optgroup>';

        		Date.prototype.stdTimezoneOffset = function() {
        		    var jan = new Date(this.getFullYear(), 0, 1);
        		    var jul = new Date(this.getFullYear(), 6, 1);
        		    return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
        		}

        		Date.prototype.dst = function() {
        		    return this.getTimezoneOffset() < this.stdTimezoneOffset();
        		}

        		var langCode = navigator.language || navigator.systemLanguage;
        		var lang = langCode.toLowerCase(); 
        		lang = lang.substr(0,2);
        		var dateObject = new Date(); //this timezone offset calc taken from http://unmissabletokyo.com/country-detector.html
        		var timeOffset = - dateObject.getTimezoneOffset() / 60; 
        		if ( dateObject.dst() )
        		    timeOffset += ((timeOffset < 0) ? -1 : 1);
        		console.log( "lang=[" + lang + "]" );
        		console.log( "timeOffset=[" + timeOffset + "]" );
        		console.log( "dst=" + dateObject.dst() );

                require(["dojo/ready", "dojo/aspect", "dijit/registry", "dojo/dom-style"], function(ready, aspect, registry, domStyle) {
                    ready( function() {
                    	aspect.after(dom.byId("id_left_layout"), "resize", function() {
                            google.maps.event.trigger( map, 'resize' );
                            google.maps.event.trigger( panorama, 'resize' );
                        });
                    });
                });

				cb_route_from_or_to_changed_handle = [];
				for (var n = 0; n < MAX_NB_WAYPOINTS+2; n++)
					cb_route_from_or_to_changed_handle[n] = undefined;

		    	var autocomplete_restriction = dom.byId('id_autocomplete_restriction').value;
		    	var autocomplete_restrict_country = dom.byId('id_autocomplete_restrict_country').value;
  	  	       	var code_country = autocomplete_restrict_country;
  	  	       	console.log( "code_country = [" + code_country + "]" );
       			places = [];
       			var route = 0;
				autocompletes = [];
				for ( var n = 0; n < MAX_NB_WAYPOINTS+2; n++ ) { 
					autocompletes[n] = new google.maps.places.Autocomplete( dom.byId('id_wp_'+n) );
					if ( autocomplete_restriction != "" )
						autocompletes[n].setTypes([ autocomplete_restriction ]);
					if ( code_country != "" )
						autocompletes[n].setComponentRestrictions( {country: code_country} );
					google.maps.event.clearListeners( autocompletes[n], 'place_changed' );
					autocompletes[n].addListener('place_changed', function( ) {
						api_counts[api_count.PLACES]++;
						console.log( this );
						var r = get_route_waypoint( autocompletes, this );
						var waypoint_index = r.waypoint_index;
//						console.log( "waypoint_index=" + waypoint_index );
//	               		console.log( "Place changed: " + waypoint_index=" + waypoint_index );
//	               		console.log( autocompletes[waypoint_index] );
						var place = autocompletes[waypoint_index].getPlace();
//	               		console.log( place );
						if ( place.geometry == undefined ) {
							function look_for_address( place_name, waypoint_index) {
								var geocoder = new google.maps.Geocoder();
								geocoder.geocode( { 'address': place_name}, function(results, status) {
									api_counts[api_count.GEOCODING]++;
									if ( status == google.maps.GeocoderStatus.OK ) {
//										console.log( results);
										api_counts[api_count.PLACES]++;
										service.getDetails({
											placeId: results[0].place_id
										}, function ( place, status ) {
											console.log( " --> " + waypoint_index );
											if ( status == google.maps.places.PlacesServiceStatus.OK ) {
												places[waypoint_index] = place;
												require(["dojo/dom-style"], function( domStyle) {
													domStyle.set( "id_wp_"+waypoint_index, { color: "black" } );
												});
											}
										});
									} 
									else {
										console.log("Geocode was not successful for the following reason: " + status);
									}
								});
							}
							look_for_address( place.name, waypoint_index );
						}
						else {
							require(["dojo/dom-style"], function( domStyle) {
								domStyle.set( "id_wp_"+waypoint_index, { color: "black" } );
							});
							dijit.byId("id_wp_"+waypoint_index).set( 'value', place.formatted_address );
						}
						if ( cb_route_from_or_to_changed_handle[waypoint_index] != undefined )
							clearTimeout( cb_route_from_or_to_changed_handle[waypoint_index] );
						places[waypoint_index] = place;
						require(["dojo/dom"], function( dom ) {
							if ( place.geometry && place.geometry.location )
								dijit.byId("gps_loc_wp_"+waypoint_index).innerHTML = "<b>" + place.geometry.location.lat() + " " + place.geometry.location.lng() + "</b>";
						});
						cb_route_from_or_to_changed_handle[waypoint_index] = setTimeout( 
							function() { cb_route_from_or_to_changed(waypoint_index); }, interval, 250 );
					});
				}

   				got_location = false;

   				var decoded_flags = decode_url_params();
				console.log("decoded_flags= " + decoded_flags );

				if ( !decoded_flags ) {
					var is_addr_for_orig = (dijit.byId('id_addr_for_orig').get( 'value') == "") ? false : true;
					if (is_addr_for_orig) {
						dijit.byId('id_wp_0').set('value', dijit.byId('id_addr_for_orig').get( 'value'));

						var geocoder = new google.maps.Geocoder();
						geocoder.geocode( { 'address': dijit.byId('id_addr_for_orig').get( 'value')}, function(results, status) {
							api_counts[api_count.GEOCODING]++;
							if ( status == google.maps.GeocoderStatus.OK ) {
//								console.log( results);
								api_counts[api_count.PLACES]++;
								service.getDetails({
									placeId: results[0].place_id
								}, function ( place, status ) {
									if ( status == google.maps.places.PlacesServiceStatus.OK ) {
										places[0] = place;
									}
								});
								map.setCenter(results[0].geometry.location);
								update_btns_remove_up_down( );
							} 
							else {
								console.log("Geocode was not successful for the following reason: " + status);
							}
						});
					}
				}

				on( dijit.byId("id_input_route"), "mouseenter", function( evt ) {

					if ( (polylines == undefined) || (timer_animate == undefined) )
						return;
					
					if ( dijit.byId('id_btn_pause').get( 'label' ) != "Pause" )
						return;

//					console.log("Enter - curr_leg=" + curr_leg);

					mouse_over_input_route = true;

					prev_zoom = map.getZoom();
					if ( play_whole_route || (curr_leg == undefined) ) {
console.log("@@@");
						map.fitBounds( route_bounds );
					}
					else {
						map.setCenter( polylines[curr_leg].getPath().getAt(0) );
						map.fitBounds( legs_bounds[curr_leg] );
console.log("@@@");
					}

				})
				
				on( dijit.byId("id_input_route"), "mouseleave", function( evt ) {

					if ( (polylines == undefined) || (timer_animate == undefined) )
						return;
					
					if ( dijit.byId('id_btn_pause').get( 'label' ) != "Pause" )
						return;

//					console.log("Leave - curr_leg=" + curr_leg);
					mouse_over_input_route = false;

					map.setCenter( polylines[curr_leg].getPath().getAt(0) );
					map.fitBounds( legs_bounds[curr_leg] );
console.log("@@@");
					if ( prev_zoom != undefined )
						map.setZoom( prev_zoom );
					prev_zoom = undefined;

					marker_pos_using_slider.setMap( null );
					marker_pos_using_slider_no_pano.setMap( null );
				})
				
				on( dijit.byId("id_input_route"), "click", function( evt ) {

					if ( (polylines == undefined) || (timer_animate == undefined) )
						return;
					
					mouse_over_input_route = true;

					require(["dojo/dom-geometry", "dojo/dom", "dojo/dom-style"], function(domGeom, dom, style){
						var node = dom.byId("id_input_route");
						var includeScroll = false;
						var output = domGeom.position(node, includeScroll);
						var x = (is_ff) ? evt.clientX : evt.x;
						var perc = ((x - output.x) / output.w) * 100;
						var new_curr_dist = (eol * perc) / 100;
						
						if ( play_whole_route || (curr_leg == undefined) ) {
							curr_leg = 0;
							while ( new_curr_dist > distances[curr_leg] )
								curr_leg++;
//							console.log( "curr_leg=" + curr_leg);
						}

//						console.log( perc + " / " + eol + " -> " + new_curr_dist );
						if ( timer_animate != undefined ) { 
							clearTimeout( timer_animate );
							timer_animate = undefined;
						}				
						(function (curr_dist ) {
							marker_pos_using_slider.setMap( null );
							marker_pos_using_slider_no_pano.setMap( null );
							if ( timer_animate != undefined )
								clearTimeout( timer_animate );
							skip_cnt = 3;
							timer_animate = setTimeout( function() { cb_animate(curr_dist); }, 50 );
						})(new_curr_dist);
					});

       			});

				on( dijit.byId("id_input_route"), "mousemove", function( evt ) {
					
					if ( (polylines == undefined) || (timer_animate == undefined) )
						return;
					
					if ( dijit.byId('id_btn_pause').get( 'label' ) == "Continue" )
						return;
						
					if ( !mouse_over_input_route )
						return;
					
					var node = dom.byId("id_input_route");
					var includeScroll = false;
					var output = domGeom.position(node, includeScroll);

					var x = (is_ff) ? evt.clientX : evt.x;
					var perc = ((x - output.x) / output.w) * 100;
					var new_curr_dist = (eol * perc) / 100;
//					console.log( perc + " / " + eol + " -> " + new_curr_dist );

					if ( play_whole_route || (curr_leg == undefined) ) {
						curr_leg = 0;
						while ( new_curr_dist > distances[curr_leg] )
							curr_leg++;
//						console.log( "curr_leg=" + curr_leg);
					}

					var polyline = polylines[curr_leg];
					
					curr_dist_in_leg = new_curr_dist;
					if ( play_whole_route ) {
						if ( curr_leg > 0 )
							curr_dist_in_leg -= distances[ curr_leg - 1 ];
					}

					var p = polyline.GetPointAtDistance( curr_dist_in_leg );
					if ( p != undefined )
						if ( !map.getBounds().contains( p ) )
							map.panTo( p );

					street_view_check.getPanoramaByLocation(p, 50, (function() { return function(result, status) {
						if (status == google.maps.StreetViewStatus.ZERO_RESULTS ) {
							if ( marker_pos_using_slider.getMap() != undefined )
								marker_pos_using_slider.setMap( null );
							marker_pos_using_slider_no_pano.setPosition( p );
							if ( marker_pos_using_slider_no_pano.getMap() == undefined )
								marker_pos_using_slider_no_pano.setMap( map );
						}
						else {
							if ( marker_pos_using_slider_no_pano.getMap() != undefined )
								marker_pos_using_slider_no_pano.setMap( null );
							if ( !mouse_over_input_route ) {
								marker_pos_using_slider.setMap( null );
							}
							else {
								marker_pos_using_slider.setPosition( p );
								if ( marker_pos_using_slider.getMap() == undefined )
									marker_pos_using_slider.setMap( map );
							}
						}
					}})());

				});

        		on( window, "resize", function( evt ) {
	        		if ( is_in_full_screen() )
						domStyle.set( "id_top_layout", "display", "none" );
	        		else
						domStyle.set( "id_top_layout", "display", "" );
					dijit.byId('app_layout').resize();
       			});

				var is_file_api = (window.File && window.FileReader && window.FileList && window.Blob) ? true : false;
				console.log( "is_file_api = " + is_file_api );
				if ( is_file_api ) {
					document.getElementById( 'id_btn_load_file').addEventListener('change', load_file_select, false );
				}

				document.getElementById("id_panorama2").style.display = "None";
				document.getElementById("id_panorama3").style.display = "None";
				document.getElementById("id_panorama4").style.display = "None";
            });

		});
            	
		window.onblur = function() {
			console.log( "window.onblur" );
		}

		window.onbeforeunload = function() {
			if ( (location.hostname != "127.0.0.1") && is_dirty )
				return "Route not saved";
			return null;
		}

    }
    
	function move_to_dist( new_pos, go_timer ) {

		var slider_disabled = dijit.byId('id_input_route').get( 'disabled' );
		if ( slider_disabled )
			return;

//		console.log( new_pos );

		if ( go_timer ) {
			if ( timer_animate != undefined )
				clearTimeout( timer_animate );
			if (interval != 10000)
				timer_animate = setTimeout( function() { cb_animate(new_pos); }, interval );
		}

        if ( play_whole_route || (curr_leg == undefined) ) {
			curr_leg = 0;
			while ( new_pos > distances[curr_leg] )
				curr_leg++;
			console.log( "curr_leg=" + curr_leg);
		}

		var polyline = polylines[curr_leg];
		
        curr_dist_in_leg = new_pos;
        if ( play_whole_route ) {
			if ( curr_leg > 0 )
				curr_dist_in_leg -= distances[ curr_leg - 1 ];
			console.log( curr_dist_in_leg );
		}

        var p = polyline.GetPointAtDistance( curr_dist_in_leg );
        if ( !map.getBounds().contains( p ) )
            map.panTo( p );

		street_view_check.getPanoramaByLocation(p, 50, (function() { return function(result, status) {
		    if (status == google.maps.StreetViewStatus.ZERO_RESULTS) {
		        console.log( "No street view available" );        
        		marker_no_street_view.setPosition( p );
		    }
		    else {
        		marker_no_street_view.setPosition( null );
        		panorama.setPosition( p );
        		var prev_bearing = bearing;
		        var bearing = polyline.Bearing( polyline.GetIndexAtDistance( curr_dist_in_leg ) );
				if (bearing == undefined)
					bearing = prev_bearing;
		        panorama.setPov({
            		heading: bearing,
		            pitch: 1
        		});
		    }
		}})());

		cb_move_to_dist = undefined;

		curr_dist_in_route = new_pos;
		skip_cnt = 3;
	}

    function cb_route_input( ) {

		var slider_disabled = dijit.byId('id_input_route').get( 'disabled' );
		if ( slider_disabled ) 
			return;

		var new_pos = dijit.byId('id_input_route').get( 'value' );
		new_pos = Math.round( new_pos );

		if ( cb_move_to_dist != undefined ) {
			clearTimeout( cb_move_to_dist );
			cb_move_to_dist = undefined;
		}
		if ( new_pos == 0 )
			new_pos = 50;
		cb_move_to_dist = setTimeout( 'require(["RouteView.js"], function( s ) { s.move_to_dist('+new_pos+', false); })', 125 );
    }

    function cb_route_input_mouse_enter( ) {
	
		if ( (polylines == undefined) || (timer_animate == undefined) )
			return;
		
        if ( dijit.byId('id_btn_pause').get( 'label' ) == "Continue" )
			return;
		
//		console.log( "Enter" );
		
	}

    function cb_route_input_mouse_leave( ) {
		
		if ( (polylines == undefined) || (timer_animate == undefined) )
			return;
		
        if ( dijit.byId('id_btn_pause').get( 'label' ) == "Continue" )
			return;
		
//		console.log( "Leave" );

		marker_pos_using_slider.setMap( null );
		marker_pos_using_slider_no_pano.setMap( null );
	}

    function cb_waypoint_changed( id, evt ) {
		console.log(evt);
		require(["dojo/dom-style"], function( domStyle ) {
			domStyle.set( id, { color: "red" } );
		});
		if (evt.key.length == 1) {
			console.log(evt);
			api_counts[api_count.PLACES]++;
		}
    }

    function cb_step_changed( ) {
    	step = dijit.byId('id_input_meters').get( 'value' );
    	console.log("step = " + step);
        document.getElementById("id_meters").innerHTML = step;
        document.getElementById("id_feet").innerHTML = Math.floor(step * 3.2808);
    	localStorage.setItem( "step", step );
    }

    function cb_interval_changed( ) {
    	interval = dijit.byId('id_input_interval').get( 'value' );
    	console.log("interval = " + interval);
    	if (interval == 10000) {
			document.getElementById("id_interval").innerHTML = "XStep by step";
			document.getElementById("id_interval_msec").innerHTML = "X";
			dijit.byId('id_btn_pause').set( 'label', "Next" );
		} 
		else {
			document.getElementById("id_interval").innerHTML = interval;
			document.getElementById("id_interval_msec").innerHTML = " Ymilliseconds";
			dijit.byId('id_btn_pause').set( 'label', "Pase" );
		}
		localStorage.setItem( "interval", interval );
    }

	function cb_route_thickness_changed( ) {
    	route_thickness = dijit.byId('id_input_route_thickness').get( 'value' );
    	console.log( "  route_thickness= " + route_thickness );
        document.getElementById("id_route_thickness").innerHTML = route_thickness;
    	localStorage.setItem( "route_thickness", parseInt(route_thickness) );
	}

	function cb_map_style_changed( ) {
    	require(["dojo/dom", "RouteViewMapStyles.js"], function(dom, s){
			var map_style = dom.byId('id_map_style').value;
			if ( map_style != "" ) {
				s.set_map_style( map, parseInt( map_style ) ); 
				localStorage.setItem( "map_style", map_style );
				console.log( "map_style= " + map_style );
			}
		})
	}

	function cb_show_tooltip_dollar( ) {
		console.log(1);
		content = 
		"<b>This is only an ESTIMATION of the Google Maps API usage!!</b><br>" +
		"<br>" +
		"<table cellspacing='4' cellpadding='4' border='1' width='100%'>" +
		"  <tr>" +
		"    <td align='center' valign='top'>" +
		"	   <b>API</b>" +
		"    </td>" +
		"    <td align='center' valign='top'>" +
		"      <b>Calls</b>" +
		"    </td>" +
		"    </tr>" +
		"  <tr>" +
		"    <td align='right' valign='top'>" +
		"      Places API" +
		"    </td>" +
		"    <td>" +
		"      <b>"+api_counts[api_count.PLACES]+"</b>" +
		"    </td>" +
		"  </tr>" +
		"  <tr>" +
		"    <td align='right' valign='top'>" +
		"      MAPS Javascript API" +
		"    </td>" +
		"    <td>" +
		"      <b>"+api_counts[api_count.MAPS_JAVASCRIPT]+"</b>" +
		"    </td>" +
		"  </tr>" +
		"  <tr>" +
		"    <td align='right' valign='top'>" +
		"      Geocoding API" +
		"    </td>" +
		"    <td>" +
		"      <b>"+api_counts[api_count.GEOCODING]+"</b>" +
		"    </td>" +
		"  </tr>" +
		"  <tr>" +
		"    <td align='right' valign='top'>" +
		"      Directions API" +
		"    </td>" +
		"    <td>" +
		"      <b>"+api_counts[api_count.DIRECTIONS]+"</b>" +
		"    </td>" +
		"  </tr>" +
		"</table>" +
		"<br>";
        document.getElementById("tooltip_btn_dollar").innerHTML = content;
	}

    function cb_click_no_hwy( ) {
        var no_hwy  = !dijit.byId('id_check_no_hwy').get( 'checked' );
		console.log("-->" + no_hwy);
		document.getElementById("id_label_check_no_hwy").innerHTML = (!no_hwy) ? "No Highway" : "Highway   ";
    	if ( !dijit.byId("id_btn_drive_1").get("disabled") )
    		do_route( true );
    }

    function cb_click_no_toll( ) {
        var no_toll  = !dijit.byId('id_check_no_toll').get( 'checked' );
		console.log("-->" + no_toll);
		document.getElementById("id_label_check_no_toll").innerHTML = (!no_toll) ? "No Toll" : "Toll   ";
    	if ( !dijit.byId("id_btn_drive_1").get("disabled") )
    		do_route( true );
    }

	function cb_set_map_type_id() {
		switch (++map_type_id % 4) {
			case 0 : map.setMapTypeId(google.maps.MapTypeId.ROADMAP); break
			case 1 : map.setMapTypeId(google.maps.MapTypeId.TERRAIN); break
			case 2 : map.setMapTypeId(google.maps.MapTypeId.HYBRID);  break
			case 3 : map.setMapTypeId(google.maps.MapTypeId.SATELLITE); break
		}
	}

    function download_file( text, name, type ) {
        var a = document.createElement("a");
        var file = new Blob([text], {type: type});
        a.href = URL.createObjectURL(file);
        a.download = name;
        a.click();
    }

    function _do_create_long_url( ) {

		var url = location.origin + location.pathname;
		url += "?";

    	require(["dojo/dom-style"], function( domStyle) {
			var display = domStyle.get( 'id_fieldset_route', "display" );
			if (display != "none") {
				url += "route="; 
				for ( var n = 0; n < MAX_NB_WAYPOINTS+2; n++ ) {
//					console.log( n );
//					console.log( places );
					var display = domStyle.get( 'id_tr_' + n, "display" );
					if ( display != "none" ) {
						if ((places[n] == undefined) || (places[n].geometry == undefined) || (places[n].geometry.location == undefined))
							domStyle.set( 'id_wp_'+n, { color: "red" } );
						console.log(places[n]);
						console.log( n + " ==> " + places[n].name + " : " + places[n].geometry.location.lat() + " , " + places[n].geometry.location.lng() );
						if (n > 0)
							url += "&"; 
						var v = dijit.byId('id_wp_'+n).get( 'value');
						url += encodeURIComponent(v);
					}
				}
			}
 		})

		return url;
    }

    function do_create_long_url( ) {
		url = _do_create_long_url();
		do_copy_message( "Long URL", "Long URL to create these routes", url, false );
    }

    function do_create_short_url( ) {

		console.log( "do_create_short_url" );
    
 		gapi.client.setApiKey( api_key );
		gapi.client.load( 'urlshortener', 'v1', makeRequest );

		 function makeRequest() {
			var request = gapi.client.urlshortener.url.insert({
				'resource': {'longUrl': 'https://codepen.io/'}
			});
			request.execute(function(response) {
		    	alert(JSON.stringify(window.got = response));
			});
		}
		
    }
    
    function do_save_gpx( ) {
		
		console.log(1);
		window.resizeBy(800, 600);
		console.log(2);
		
    	// xmllint --noout --schema http://www.topografix.com/GPX/1/0/gpx.xsd testfile.gpx

		var nb_wp = 0;
		console.log( places );
    	require(["dojo/dom-style"], function( domStyle) {
			var display = domStyle.get( 'id_fieldset_route', "display" );
//     		console.log(display);
			if (display != "none") {
				console.log( places );
				for ( var n = 0; n < MAX_NB_WAYPOINTS+2; n++ ) {
					var display = domStyle.get( 'id_tr_' + n, "display" );
					if ( display != "none" ) {
						if ( (places[n] == undefined) || (places[n].geometry == undefined) ) {
//							console.log( route_index + " , " + n + " ==> " + places[n].name + " ? " );
							domStyle.set( 'id_wp_'+n, { color: "red" } );
						}
						else {
							if ( places[n].geometry.location == undefined ) {
								console.log( n + " ==> " + places[n].name + " ? " + places[n].geometry );
							}
							else {
								console.log(  + " ==> " + places[n].name + " : " + places[n].geometry.location.lat() + " , " + places[n].geometry.location.lng() );
							}
						}
						nb_wp++;
					}
				}
				console.log("Route has " + nb_wp + " waypoints");
			}
 		})
    	
    	var crlf = String.fromCharCode(13) + String.fromCharCode(10);
    	
        var gpx = '';
        
        gpx += '<?xml version="1.0" encoding="UTF-8"?>' + crlf +
        	'<gpx version="1.0" creator="" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.topografix.com/GPX/1/0" xsi:schemaLocation="http://www.topografix.com/GPX/1/0 http://www.topografix.com/GPX/1/0/gpx.xsd">' + crlf + 
        	'<time>2015-06-12T21:36:34Z</time>' +crlf;

		var src = '';
		var dst = '';

		for ( n = 0; n < nb_wp; n++ ) {
			if ( src == "" )
				src = places[n].name;
			if ( places[n] == undefined )
				break;
			dst = places[n].name;
			gpx += '<wpt ' + crlf;
			gpx += '  lat="' + places[n].geometry.location.lat() + '" lon="' + places[n].geometry.location.lng() + '">' + crlf;
			gpx += '  <name>' + places[n].name + '</name>' + crlf;
			gpx += '</wpt>' + crlf;
		}
        
        gpx += '<rte>' + crlf;
//      gpx += '  <name>' + route.summary + '</name>' + crlf;
        gpx += '  <name>' + src + ' to ' + dst + '</name>' + crlf;
		for ( n = 0; n < nb_wp; n++ ) {
//			console.log( "route: " waypoint:" + n );
			gpx += '  <rtept ' + crlf;
			if ((places[n].geometry == undefined) || (places[n].geometry.location == undefined))
				domStyle.set( 'id_wp_'+n, { color: "red" } );
			gpx += '    lat="' + places[n].geometry.location.lat() + '" lon="' + places[n].geometry.location.lng() + '">' + crlf;
			gpx += '    <name>' + places[n].name + '</name>' + crlf;
			gpx += '  </rtept>' + crlf;
		}
        gpx += '</rte>' + crlf;
        gpx += '</gpx>' + crlf;
        	
		var d = new Date();
		var year = d.getFullYear();
		var mon  = d.getMonth() + 1;
		var day  = d.getDate();
		var fname = year + '-' + ((mon < 10) ? '0' : '') + mon + '-' + ((day < 10) ? '0' : '') + day + '.gpx';
//		console.log( gpx );	
    	download_file( gpx, fname, "application/gpx+xml" );

    }
    
    // https://developers.google.com/maps/documentation/urls/guide#constructing-valid-urls
    function build_gmaps_url( ) {
		
		var url = "";

    	require(["dojo/dom-style"], function( domStyle) {
			
       		var display = domStyle.get( 'id_fieldset_route', "display" );
       		if (display != "none") {
				
				var nb_wp = -2;
	            for ( var n = 0; n < MAX_NB_WAYPOINTS+2; n++ ) {
	        		var display = domStyle.get( 'id_tr_' + n, "display" );
	            	if ( display == "none" )
						break;
					nb_wp++;
				}
	            console.log("Route has " + nb_wp + " waypoints");
	            if ( nb_wp < 0 )
					return "";
				if ( nb_wp >= 10 )
					url += "https://www.google.com/maps/dir"
				else
					url += "https://www.google.com/maps/dir/?api=1"

	            for ( var n = 0; n < nb_wp+2; n++ ) {
//					console.log( n );
//					console.log( places );
	        		var display = domStyle.get( 'id_tr_' + n, "display" );
	            	if ( display != "none" ) {
						if ((places[n] == undefined) || (places[n].geometry == undefined) || (places[n].geometry.location == undefined))
							domStyle.set( 'id_wp_'+n, { color: "red" } );
						console.log(places[n]);
	            		console.log( n + " ==> " + places[n].name + " : " + places[n].geometry.location.lat() + " , " + places[n].geometry.location.lng() );
						var v = dijit.byId('id_wp_'+n).get( 'value');
						if ( nb_wp >= 10 ) {
							url += "/"; 
						}
						else {
							if ( n == 0 )
								url += "&origin=";
							else if ( n == nb_wp+1 )
								url += "&destination=";
							else if ( n == 1 )
								url += "&waypoints=";
							else
								url += "%7C";
						}
		    	        url += encodeURIComponent(v);
	            	}
	            }

				console.log("Gmaps url length = " + url.length);
				if ( url.length >= 2040 ) {
					show_error( "The URL is too long. Try to remove one or more waypoints." );
					return "";
				}
				if ( nb_wp < 10 ) {
					if ( url.length < 2048-30 )
						url += "&dir_action=navigate&travelmode=driving";
					console.log("Gmaps url length = " + url.length);
					url += "&dirflg=h,t";
				}
    		}

 		})
		return url;
	}

    function do_create_gmaps_url( ) {
		var url = build_gmaps_url();
		if ( url != "" )
			do_copy_message( "Google Maps URL", "Use this URL in Google Maps (desktop or mobile)", url, true );
	}

    function cb_route_from_or_to_changed( waypoint_index ) {

		console.log( "cb_route_from_or_to_changed: " + waypoint_index );

		cb_route_from_or_to_changed_handle[waypoint_index] = undefined; 

		var origin = dijit.byId('id_wp_0').get( 'value' );
		var waypoint1 = dijit.byId('id_wp_1').get( 'value' );
		var destination = dijit.byId('id_wp_2').get( 'value' );
		console.log( "origin= [" + origin + "]" );
		console.log( "destination= [" + destination + "]" );
		console.log( "waypoint1= [" + waypoint1 + "]" );

		var nok_route = ((origin == "") || ((waypoint1 == "") && (destination == ""))) ? true : false;
		console.log( "nok_route= " + nok_route);
        
    	update_btns_remove_up_down( );
    	
		if ( !nok_route ) {
    		do_route( true );
    	}
    	else if ( (origin != "") && (waypoint1 == "") && (destination == "") ) {
    		if ( (places[0].geometry != undefined) && (places[0].geometry.location != undefined) )
           		map.panTo( places[0].geometry.location );
           	map.panTo( places[0].geometry.location );
    	}
    }

    function cb_map_click( evt ) {

/*
		if ( streetViewLayer.getMap() == undefined ) {
			console.log( "cb_map_clicked" );
			return;
		}
*/
    	console.log(evt);
    	where = {'location': evt.latLng};
    	return;
    	
		var geocoder = new google.maps.Geocoder();
    	geocoder.geocode( where, function( results, status ) {
			api_counts[api_count.GEOCODING]++;
    	    if (status === google.maps.GeocoderStatus.OK) {
    	    	console.log(results[0].formatted_address);
				require(["dijit/Tooltip"], function(Tooltip){
					//var around = {x:evt.ub.clientX, y:evt.ub.clientY, h:undefined, w:undefined};
					var around = {x:500, y:0, h:undefined, w:undefined};
					//Tooltip.show(results[0].formatted_address, around);
/*					
					dlg = new Tooltip({
						id: ["id_xxx"],
						connectId: ["id_map_canvas"],
						position:['below-centered'],
						label: "XXXXXXXXXXXXXXXXX",
						showDelay:999999,
						hideDelay:0
					});
					//dlg.placeAt("id_map_canvas", evt.pixel);
					//dlg.show();
*/
				});
			}
    	});

    }

    function show_waypoint( index ) {

    	require(["dojo/dom-style"], function( domStyle) {
    		domStyle.set( 'id_tr_' + index, "display", "" );
    	});
    }
    
    function set_labels_from_wp_to( ) {

    	require(["dojo/dom-style"], function( domStyle) {
    	var route = 0;
            for ( var n = 1; n < MAX_NB_WAYPOINTS+2; n++ ) {
            	var id = 'id_tr_' + n;
        		var display = domStyle.get( id, "display" );
            	if ( display == "none" ) {
                	var id_label = 'id_label' + (n-1);
                    document.getElementById(id_label).innerHTML = "To&nbsp;";
            		break;
            	}
            	else {
                	var id_label = 'id_label' + n;
                    document.getElementById(id_label).innerHTML = "Through&nbsp;";
            	}
            }
 		});

    }
    
    function cb_map_rightclick( evt ) {

		console.log( "Right click: " + evt );    	

		if ( !dijit.byId("id_btn_stop").get("disabled") )
			return;

		if ( !dijit.byId("id_btn_pause").get("disabled") && (dijit.byId('id_btn_pause').get('label') == "Pause") )
			return;

    	if ( dijit.byId("id_btn_drive_1").get("disabled") )
    		return;
    	
		try {
			if (evt.vb.ctrlKey)
				return update_place({'location': evt.latLng}, evt.latLng.toString());
		} catch (err) {
			try {
				if (evt.ub.ctrlKey)
					return update_place({'location': evt.latLng}, evt.latLng.toString());
			} catch (err) {
			}
		}
								
    	update_place({'location': evt.latLng});
    }
    
    function change_waypoint( index_wp, place_name ) {

    	console.log( index_wp + " -> " + place_name );
    	var id_label_wp = "id_wp_" + index_wp;
		dijit.byId(id_label_wp).set( 'value', place_name );

		do_route( true );
    }

	function cb_click_btn_add( index ) {
		
//		console.log( "*** Add: index=" + index );

        var first_hidden = find_first_hidden( );
//    	console.log( "first_hidden=" + first_hidden );

    	for ( var n = first_hidden - 1; n >= index; n-- ) {

			var wp = dijit.byId('id_wp_'+(n)).get( 'value' );
			console.log( n + " -> " + wp );
			dijit.byId('id_wp_'+(n+1)).set( 'value', wp );

			places[n+1] = places[n];
    	}
    	if (index < MAX_NB_WAYPOINTS+2)
			dijit.byId('id_wp_'+(index)).set( 'value', "" );

    	require(["dojo/dom-style"], function( domStyle) {
    		domStyle.set( 'id_tr_'+(first_hidden), "display", "" );
    		domStyle.set( 'id_drive_tr_'+(first_hidden), "display", "" );
    	});
    	
		require([ "dijit/focus", "dojo/dom", "dojo/domReady!" ], function(focusUtil, dom){
			focusUtil.focus(dom.byId('id_wp_'+(index)));
		});
		
		update_btns_remove_up_down( );		
	}
		
	function cb_click_btn_remove( index ) {
		
		console.log( "*** Remove: index=" + index );

        var first_hidden = find_first_hidden( );
    	console.log( "first_hidden=" + first_hidden );

		for ( var n = index; n < first_hidden - 1; n++ ) {
			var wp = dijit.byId('id_wp_'+(n+1)).get( 'value' );
			dijit.byId('id_wp_'+(n)).set( 'value', wp );
		}

    	require(["dojo/dom-style"], function( domStyle) {
    		domStyle.set( 'id_tr_'+(first_hidden-1), "display", "none" );
    		domStyle.set( 'id_drive_tr_'+(first_hidden-1), "display", "none" );
    	});
    	
    	require(["dojo/dom-style"], function( domStyle) {
    		domStyle.set( 'id_tr_'+(first_hidden-1), "display", "none" );
    	});
		
		do_route( true );
		update_btns_remove_up_down( );		
	}

	function cb_click_btn_up( index ) {

		console.log( "*** Up: index=" + index );

		var wp_a = dijit.byId('id_wp_'+(index)).get( 'value' );
		var wp_b = dijit.byId('id_wp_'+(index-1)).get( 'value' );

		dijit.byId('id_wp_'+(index)).set( 'value', wp_b );
		dijit.byId('id_wp_'+(index-1)).set( 'value', wp_a );

		do_route( true );
	}

	function cb_click_btn_down( index ) {

		console.log( "*** Down: index=" + index );

		var wp_a = dijit.byId('id_wp_'+(index)).get( 'value' );
		var wp_b = dijit.byId('id_wp_'+(index+1)).get( 'value' );

		dijit.byId('id_wp_'+(index)).set( 'value', wp_b );
		dijit.byId('id_wp_'+(index+1)).set( 'value', wp_a );
		
		do_route( true );
	}

	function set_map_pano_layout( ) {
		
    	require(["dojo/dom-construct"], function( domConstruct ) {
			
			switch ( map_pano_layout ) {
				case 1 : 
					map_width  = "20%"; 
					pano_width = "80%"; 
					break;
				case 2 : 
					map_width  = "30%"; 
					pano_width = "70%"; 
					break;
				case 3 : 
					map_width  = "40%"; 
					pano_width = "60%"; 
					break;
				case 4 : 
					map_width  = "50%"; 
					pano_width = "50%"; 
					break;
			}
			if ( map_or_panorama_full_screen ) {
				domConstruct.place("td_panoramas_canvas", "td_map_canvas", "after");
				map_or_panorama_full_screen = false;
			}
			document.getElementById("td_map_canvas").style.width  = map_width;
			document.getElementById("td_panoramas_canvas").style.width = pano_width;
			google.maps.event.trigger( map, 'resize' );
			google.maps.event.trigger( panorama, 'resize' );
			window.dispatchEvent(new Event('resize'));

			if ( play_whole_route || (curr_leg == undefined) ) {
				if ( streetViewLayer.getMap() == undefined ) {
					map.fitBounds( route_bounds );
				}
			}
			else {
				if ( streetViewLayer.getMap() == undefined ) {
					map.setCenter( polylines[curr_leg].getPath().getAt(0) );
					map.fitBounds( legs_bounds[curr_leg] );
				}
			}
		});
	}
	
	function cb_click_btn_highway( waypoint_index ) {
		console.log( "Highway: waypoint_index=" + waypoint_index );
		do_route( true );
	}
		
	function cb_click_btn_drive( waypoint_index ) {
		
		console.log( "Drive: waypoint_index=" + waypoint_index );
		
		if ( waypoint_index == -1 ) {
			waypoint_index = 0;
			play_whole_route = true;
		}
		else {
			play_whole_route = false;
		}

		curr_leg = waypoint_index;

		prev_pano_id = "";
		pano_cnt = 0;
		skip_cnt = 0;

    	require(["dojo/dom-style"], function( domStyle ) {
			domStyle.set( "id_top_layout", "display", "none" );
			domStyle.set( "id_left_layout", "display", "none" );
			dijit.byId('app_layout').resize();
			set_map_pano_layout( );
		});

		dijit.byId('id_btn_pause').set( 'disabled', false );
		dijit.byId('id_btn_stop').set( 'disabled', false );
		dijit.byId('id_btn_map_pano_layout').set( 'disabled', false );

		if ( step == undefined ) {
			step     = dijit.byId('id_input_meters').get( 'value' );
			interval = dijit.byId('id_input_interval').get( 'value' );
			console.log( "step=" + step + " interval=" + interval );
		}

        start_driving( );  

		mouse_over_input_route = false;
	}
	
	function cb_click_btn_drive_whole_route( ) {
		cb_click_btn_drive( -1 );
	}
	
	function update_btns_remove_up_down( all ) {
		
        var first_hidden = find_first_hidden( );
//    	console.log( "first_hidden=" + first_hidden );

		var origin = dijit.byId('id_wp_0').get( 'value' );
   		dijit.byId('id_btn_add_0').set( 'disabled', (first_hidden < (MAX_NB_WAYPOINTS+2)) ? false : true );
   		dijit.byId('id_tooltip_btn_add_0').set( 'showDelay', (first_hidden < (MAX_NB_WAYPOINTS+2)) ? 650 : 999999 );
   		dijit.byId('id_btn_remove_0').set( 'disabled', (first_hidden > 2) ? false : true );
   		dijit.byId('id_tooltip_btn_remove_0').set( 'showDelay', (first_hidden > 2) ? 650 : 999999 );
   		dijit.byId('id_btn_down_0').set( 'disabled', (origin == '') ? true : false ); 
   		dijit.byId('id_tooltip_btn_down_0').set( 'showDelay', (origin == '') ? 999999 : 650 ); 
    	
		for ( var n = 1; n < first_hidden - 1; n++ ) {
			var waypoint = dijit.byId('id_wp_'+n).get( 'value' );
	   		dijit.byId('id_btn_add_'+n).set( 'disabled', false ); 
	   		dijit.byId('id_tooltip_btn_add_'+n).set( 'showDelay', 650 ); 
	   		dijit.byId('id_btn_remove_'+n).set( 'disabled', false ); 
	   		dijit.byId('id_tooltip_btn_remove_'+n).set( 'showDelay', 650 ); 
	   		dijit.byId('id_btn_up_'+n).set( 'disabled', (waypoint == '') ? true : false ); 
	   		dijit.byId('id_tooltip_btn_up_'+n).set( 'showDelay', (waypoint == '') ? 999999 : 650 ); 
	   		dijit.byId('id_btn_down_'+n).set( 'disabled', (waypoint == '') ? true : false ); 
	   		dijit.byId('id_tooltip_btn_down_'+n).set( 'showDelay', (waypoint == '') ? 9999999 : 650 ); 
		}
		
		dijit.byId('id_btn_drive_whole_route').set( 'disabled', true );
		for ( var n = 1; n < first_hidden; n++ ) {
			var wp0 = dijit.byId('id_wp_'+(n-1)).get( 'value' );
			var wp1 = dijit.byId('id_wp_'+n).get( 'value' );
// 			dijit.byId('id_btn_drive_'+n).set( 'disabled', ((wp0 == '') || (wp1 == '')) ? true : false );
	   		if ( (wp0 == '') || (wp1 == '') ) {
		   		dijit.byId('id_btn_drive_'+n).set( 'disabled', true );
				dijit.byId('id_tooltip_btn_drive_'+n).set( 'showDelay', 999999 );
	   		}
	   		else {
		   		dijit.byId('id_btn_drive_'+n).set( 'disabled', false );
				dijit.byId('id_tooltip_btn_drive_'+n).set( 'showDelay', 650 );
				dijit.byId('id_btn_drive_whole_route').set( 'disabled', false );
	   		}
		}
		
   		dijit.byId('id_btn_add_'+(first_hidden-1)).set( 'disabled', (first_hidden < (MAX_NB_WAYPOINTS+2)) ? false : true );
   		dijit.byId('id_tooltip_btn_add_'+(first_hidden-1)).set( 'showDelay', (first_hidden < (MAX_NB_WAYPOINTS+2)) ? 650 : 999999 );
   		dijit.byId('id_btn_remove_'+(first_hidden-1)).set( 'disabled', (first_hidden > 2) ? false : true );
   		dijit.byId('id_tooltip_btn_remove_'+(first_hidden-1)).set( 'showDelay', (first_hidden > 2) ? 650 : 999999 );
		var destination = dijit.byId('id_wp_'+(first_hidden-1)).get( 'value' );
   		dijit.byId('id_btn_up_'+(first_hidden-1)).set( 'disabled', (destination == '') ? true : false );
   		dijit.byId('id_tooltip_btn_up_'+(first_hidden-1)).set( 'showDelay', (destination == '') ? 999999 : 650 );
   		dijit.byId('id_btn_down_'+(first_hidden-1)).set( 'disabled', true );
   		dijit.byId('id_tooltip_btn_down_'+(first_hidden-1)).set( 'showDelay', 999999 );
	
	}
	
	function cb_open_settings( ) {
		require(["dijit/Dialog", "dojo/domReady!"], function( Dialog ) {
		    dlg = new Dialog({
		        title: "Settings",
    		    closable: false,
		        href: "dlg-settings.html"
		    });
		});
	    dlg.show();
	}

	function cb_copy_long_url( ) {
	
		var copyTextarea = document.querySelector('.js-copytextarea');
		copyTextarea.select();

		try {
			var successful = document.execCommand('copy');
			var msg = successful ? 'successful' : 'unsuccessful';
			console.log('Copying text command was ' + msg);
			is_dirty = false;
		} catch (err) {
			console.log('Oops, unable to copy');
		}
	}
	
	function cb_copy_long_url_and_new_tab() {

		var copyTextarea = document.querySelector('.js-copytextarea');
		copyTextarea.select();

		try {
			var successful = document.execCommand('copy');
			var msg = successful ? 'successful' : 'unsuccessful';
			console.log('Copying text command was ' + msg);
			is_dirty = false;
		} catch (err) {
			console.log('Oops, unable to copy');
		}

		if (document.getElementById('id_is_gmaps_url').innerHTML == "yes")
			url = build_gmaps_url();
		else
			url = _do_create_long_url();
		var redirectWindow = window.open(url, '_blank');
		redirectWindow.location;		
	}
	
	function cb_change_google_maps_api_key( ) {
        var old_google_maps_api_key = dijit.byId('id_google_maps_api_key').get('old_value');
        var google_maps_api_key = dijit.byId('id_google_maps_api_key').get('value');
		console.log("old:"+old_google_maps_api_key);
		console.log("new:"+google_maps_api_key);
    	localStorage.setItem( "id_google_maps_api_key", google_maps_api_key );

		if (old_google_maps_api_key != google_maps_api_key) {
			require(["dijit/Dialog", "dojo/domReady!"], function(Dialog){
				msg = 
				"<div align='center'>" +
				"  <b>You have provided a Google Maps API Key.</b><br>" +
				"<br>This API key has been saved locally on your computer<br>(using HTML5 Web Storage).<br>" +
				"<br><b>This page will need to be reloaded to use the new Google API Key.</b><br><br>" +
				"</div>" +
				"<div style='display: inline-block; text-align: right; width: 100%'>" +
				"<button dojoType='dijit/form/Button' type='button' onclick='dlg_change_google_maps_api_key.hide();location.reload(true);'>Reload</button>" +
				"<button dojoType='dijit/form/Button' type='button' onclick='dlg_change_google_maps_api_key.hide();'>Cancel</button>" +
				"</div>";
				dlg_change_google_maps_api_key = new Dialog({
					title: "Google Maps API Key",
					closable: false,
					duration:250,
					content: msg,
					style: "min-width: 250px"
				});
				dlg_change_google_maps_api_key.show();
			});
		}
	}

	function cb_change_starting_position() {
		var old_addr_for_orig = dijit.byId('id_addr_for_orig').get('old_value');
		var addr_for_orig = dijit.byId('id_addr_for_orig').get('value');
		console.log("old:"+old_addr_for_orig);
		console.log("new:"+addr_for_orig);
		localStorage.setItem( "id_addr_for_orig", addr_for_orig );
	}

	function cb_change_autocomplete_type_restriction() {
		require(["dojo/dom"], function(dom) {
	    	var autocomplete_restriction = dom.byId('id_autocomplete_restriction').value;
	    	localStorage.setItem( "autocomplete_restriction", autocomplete_restriction );
	    	console.log( "  autocomplete_restriction= " + autocomplete_restriction );
		});
	}

	function cb_change_autocomplete_restrict_country() {
		require(["dojo/dom"], function(dom) {
	    	var autocomplete_restrict_country = dom.byId('id_autocomplete_restrict_country').value;
	    	localStorage.setItem( "autocomplete_restrict_country", autocomplete_restrict_country );
	    	console.log( "  autocomplete_restrict_country= " + autocomplete_restrict_country );
		});
	}

	function cb_hide_google_maps_api_key( ) {
		var visible = dijit.byId('id_show_google_maps_api_key').get( 'checked' );
		document.getElementById("id_google_maps_api_key").type = (visible) ? "text" : "password";
	}

    function parse( type ) {
    	return typeof type == 'string' ? JSON.parse(type) : type;
    }

    function load_settings( ) {

		api_counts[api_count.PLACES] = 0;
		api_counts[api_count.MAPS_JAVASCRIPT] = 0;
		api_counts[api_count.GEOCODING] = 0;
		api_counts[api_count.DIRECTIONS] = 0;

		console.log( "Load settings:" );
        require(["dojo/dom"], function( dom) {

	    	if ( typeof(Storage) == "undefined" ) {
	    		console.log( "  No local storage!" );
	    		return;
	    	}
	    	
	    	var no_hwy = localStorage.getItem("no_highway");
	    	if ( !no_hwy )
	    		no_hwy = true;
    		console.log( "  Route - Restored no_hwy= " + no_hwy );
	    	if ( no_hwy != null )
    	        dijit.byId('id_check_no_hwy').set( 'checked', parse(no_hwy), false );
			document.getElementById("id_label_check_no_hwy").innerHTML = (no_hwy) ? "No Highway" : "Highway";
	    	
	    	var no_toll = localStorage.getItem("no_toll");
	    	if ( !no_toll )
	    		no_toll = true;
    		console.log( "  Route - Restored no_toll= " + no_toll );
    		if ( no_toll != null )
            	dijit.byId('id_check_no_toll').set( 'checked', parse(no_toll), false );
			document.getElementById("id_label_check_no_toll").innerHTML = (no_toll) ? "No Toll" : "Toll";
	
	    	step = localStorage.getItem("step");
	    	if ( !step )
	    		step = 150;
	    	else
	    		step = parseInt(step);
	    	console.log( "  Restored step= " + step );
	    	if ( step != null ) {
	            dijit.byId('id_input_meters').set( 'intermediateChanges', false );
	            dijit.byId('id_input_meters').set( 'value', step, false );
	            dijit.byId('id_input_meters').set( 'intermediateChanges', true );
				document.getElementById("id_meters").innerHTML = step;
				document.getElementById("id_feet").innerHTML = Math.floor(step * 3.2808);
	        }
	    	
	    	interval = localStorage.getItem("interval");
	    	if ( !interval )
	    		interval = 750;
	    	else
	    		interval = parseInt(interval);
	    	console.log( "  Restored interval= " + interval );
	    	if ( interval != null ) {
	            dijit.byId('id_input_interval').set( 'intermediateChanges', false );
	            dijit.byId('id_input_interval').set( 'value', interval, false );
	            dijit.byId('id_input_interval').set( 'intermediateChanges', true );
	        }
			if (interval == 10000) {
				document.getElementById("id_interval").innerHTML = "Step by step";
				document.getElementById("id_interval_msec").innerHTML = "";
				dijit.byId('id_btn_pause').set( 'label', "Next" );
			} 
			else {
				document.getElementById("id_interval").innerHTML = interval;
				document.getElementById("id_interval_msec").innerHTML = " milliseconds";
				dijit.byId('id_btn_pause').set( 'label', "Pause" );
			}
	    	
	    	map_pano_layout = localStorage.getItem("map_pano_layout");
	    	if ( !map_pano_layout )
	    		map_pano_layout = 1;
	    	else
	    		map_pano_layout = parseInt(map_pano_layout);
	    	map_pano_layout = parse(map_pano_layout);
	    	console.log( "  Restored map_pano_layout= " + map_pano_layout );
			dijit.byId('btn_map_pano_layout_'+map_pano_layout).set('selected', true, false);

	    	var route_thickness = localStorage.getItem("route_thickness");
	    	if ( !route_thickness )
	    		route_thickness = 3;
	    	else
	    		route_thickness = parseInt(route_thickness);
	    	console.log( "  Restored route_thickness= " + route_thickness );
	    	if ( route_thickness != null ) {
	            dijit.byId('id_input_route_thickness').set( 'intermediateChanges', false );
	            dijit.byId('id_input_route_thickness').set( 'value', parse(route_thickness), false );
	            dijit.byId('id_input_route_thickness').set( 'intermediateChanges', true );
	        }

			cb_click_inc_dec_floating_pane(0, false);

	    	var google_maps_api_key = localStorage.getItem("id_google_maps_api_key");
	    	if ( !google_maps_api_key )
	    		google_maps_api_key = "";
	    	console.log( "  Restored google_maps_api_key= " + google_maps_api_key );
	        dijit.byId('id_google_maps_api_key').set( 'value', google_maps_api_key, false );
	    	
	    	var addr_for_orig = localStorage.getItem("id_addr_for_orig");
	    	if ( !addr_for_orig )
	    		addr_for_orig = "";
	    	console.log( "  Restored addr_for_orig= " + addr_for_orig );
	        dijit.byId('id_addr_for_orig').set( 'value', addr_for_orig, false );
	    	
	    	var map_style = localStorage.getItem("map_style");
	    	if ( !map_style )
	    		map_style = "1";
	    	console.log( "  Restored map_style= " + map_style );
	    	dom.byId('id_map_style').value = map_style;
	            
	    	var autocomplete_restriction = localStorage.getItem("autocomplete_restriction");
	    	if ( !autocomplete_restriction )
	    		autocomplete_restriction = "";
	    	console.log( "  Restored autocomplete_restriction= " + autocomplete_restriction );
	    	dom.byId('id_autocomplete_restriction').value = autocomplete_restriction;
	            
	    	var autocomplete_restrict_country = localStorage.getItem("autocomplete_restrict_country");
	    	if ( !autocomplete_restrict_country )
	    		autocomplete_restrict_country = "";
	    	console.log( "  Restored autocomplete_restrict_country= " + autocomplete_restrict_country );
	    	dom.byId('id_autocomplete_restrict_country').value = autocomplete_restrict_country;
	            
        });
    	
    }
    
    function clear_settings( ) {

    	if ( typeof(Storage) == "undefined" ) {
    		console.log( "No local storage!" );
    		return;
    	}

		require(["dijit/ConfirmDialog", "dojo/domReady!"], function(ConfirmDialog){
			var dlg = new ConfirmDialog({
				title: "Clear Settings",
				content: "All your current settings will be deleted.",
				style: "width: 300px"
			});
			dlg.on('execute', function() { localStorage.clear(); console.log("Clear Settings: Done"); });
			dlg.on('cancel',  function() { console.log("Clear Settings: cancelled"); });
			dlg.show();
		});

    	var dlg = dijit.byId('id_configuration_dlg');
    	dlg.closeDropDown( false );
    }
    
    function load_file_select( evt ) {
		
		var files = evt.target.files; 
		console.log( files );
	}

	require(["dojo/store/Memory"], function( Memory ) {
		_iso_countries = [
            {code: 'AL', id: 'Albania'},
            {code: 'DZ', id: 'Algeria'},
            {code: 'AS', id: 'American Samoa'},
            {code: 'XX', id: ''},
            {code: 'AD', id: 'Andorra'},
            {code: 'AO', id: 'Angola'},
            {code: 'AI', id: 'Anguilla'},
            {code: 'AG', id: 'Antigua and Barbuda'},
            {code: 'AR', id: 'Argentina'},
            {code: 'AM', id: 'Armenia'},
            {code: 'AW', id: 'Aruba'},
            {code: 'AU', id: 'Australia'},
            {code: 'AT', id: 'Austria'},
            {code: 'AZ', id: 'Azerbaijan'},
            {code: 'BS', id: 'Bahamas'},
            {code: 'BH', id: 'Bahrain'},
            {code: 'BD', id: 'Bangladesh'},
            {code: 'BB', id: 'Barbados'},
            {code: 'BY', id: 'Belarus'},
            {code: 'BE', id: 'Belgium'},
            {code: 'BZ', id: 'Belize'},
            {code: 'BJ', id: 'Benin'},
            {code: 'BM', id: 'Bermuda'},
            {code: 'BT', id: 'Bhutan'},
            {code: 'BO', id: 'Bolivia'},
            {code: 'BA', id: 'Bosnia'},
            {code: 'BW', id: 'Botswana'},
            {code: 'BR', id: 'Brazil'},
            {code: 'BN', id: 'Brunei'},
            {code: 'BG', id: 'Bulgaria'},
            {code: 'BF', id: 'Burkina Faso'},
            {code: 'BI', id: 'Burundi'},
            {code: 'KH', id: 'Cambodia'},
            {code: 'CM', id: 'Cameroon'},
            {code: 'CA', id: 'Canada'},
            {code: 'CV', id: 'Cape Verde'},
            {code: 'KY', id: 'Cayman Islands'},
            {code: 'CF', id: 'Central African Republic'},
            {code: 'TD', id: 'Chad'},
            {code: 'CL', id: 'Chile'},
            {code: 'CN', id: 'China'},
            {code: 'CO', id: 'Colombia'},
            {code: 'KM', id: 'Comoros'},
            {code: 'CG', id: 'Congo'},
            {code: 'CD', id: 'Congo, Democratic Republic'},
            {code: 'CK', id: 'Cook Islands'},
            {code: 'CR', id: 'Costa Rica'},
            {code: 'CI', id: 'Ivory Coast'},
            {code: 'HR', id: 'Croatia'},
            {code: 'CU', id: 'Cuba'},
            {code: 'CY', id: 'Cyprus'},
            {code: 'CZ', id: 'Czech Republic'},
            {code: 'DK', id: 'Denmark'},
            {code: 'DJ', id: 'Djibouti'},
            {code: 'DM', id: 'Dominica'},
            {code: 'DO', id: 'Dominican Republic'},
            {code: 'EC', id: 'Ecuador'},
            {code: 'EG', id: 'Egypt'},
            {code: 'SV', id: 'El Salvador'},
            {code: 'GQ', id: 'Equatorial Guinea'},
            {code: 'ER', id: 'Eritrea'},
            {code: 'EE', id: 'Estonia'},
            {code: 'ET', id: 'Ethiopia'},
            {code: 'FK', id: 'Falkland Islands (Malvinas)'},
            {code: 'FJ', id: 'Fiji'},
            {code: 'FI', id: 'Finland'},
            {code: 'FR', id: 'France'},
            {code: 'GF', id: 'French Guiana'},
            {code: 'PF', id: 'French Polynesia'},
            {code: 'GA', id: 'Gabon'},
            {code: 'GM', id: 'Gambia'},
            {code: 'GE', id: 'Georgia'},
            {code: 'DE', id: 'Germany'},
            {code: 'GH', id: 'Ghana'},
            {code: 'GI', id: 'Gibraltar'},
            {code: 'GR', id: 'Greece'},
            {code: 'GL', id: 'Greenland'},
            {code: 'GD', id: 'Grenada'},
            {code: 'GP', id: 'Guadeloupe'},
            {code: 'GU', id: 'Guam'},
            {code: 'GT', id: 'Guatemala'},
            {code: 'GG', id: 'Guernsey'},
            {code: 'GN', id: 'Guinea'},
            {code: 'GW', id: 'Guinea Bissau'},
            {code: 'GY', id: 'Guyana'},
            {code: 'HT', id: 'Haiti'},
            {code: 'HN', id: 'Honduras'},
            {code: 'HK', id: 'Hong Kong'},
            {code: 'HU', id: 'Hungary'},
            {code: 'IS', id: 'Iceland'},
            {code: 'IN', id: 'India'},
            {code: 'ID', id: 'Indonesia'},
            {code: 'IR', id: 'Iran'},
            {code: 'IQ', id: 'Iraq'},
            {code: 'IE', id: 'Ireland'},
            {code: 'IL', id: 'Israel'},
            {code: 'IT', id: 'Italy'},
            {code: 'JM', id: 'Jamaica'},
            {code: 'JP', id: 'Japan'},
            {code: 'JO', id: 'Jordan'},
            {code: 'KZ', id: 'Kazakhstan'},
            {code: 'KE', id: 'Kenya'},
            {code: 'KI', id: 'Kiribati'},
            {code: 'KR', id: 'Korea'},
            {code: 'KW', id: 'Kuwait'},
            {code: 'KG', id: 'Kyrgyzstan'},
            {code: 'LA', id: 'Laos'},
            {code: 'LV', id: 'Latvia'},
            {code: 'LB', id: 'Lebanon'},
            {code: 'LS', id: 'Lesotho'},
            {code: 'LR', id: 'Liberia'},
            {code: 'LY', id: 'Libya'},
            {code: 'LI', id: 'Liechtenstein'},
            {code: 'LT', id: 'Lithuania'},
            {code: 'LU', id: 'Luxembourg'},
            {code: 'MK', id: 'Macedonia'},
            {code: 'MG', id: 'Madagascar'},
            {code: 'MW', id: 'Malawi'},
            {code: 'MY', id: 'Malaysia'},
            {code: 'MV', id: 'Maldives'},
            {code: 'ML', id: 'Mali'},
            {code: 'MT', id: 'Malta'},
            {code: 'MH', id: 'Marshall Islands'},
            {code: 'MQ', id: 'Martinique'},
            {code: 'MU', id: 'Mauritius'},
            {code: 'YT', id: 'Mayotte'},
            {code: 'MX', id: 'Mexico'},
            {code: 'FM', id: 'Micronesia'},
            {code: 'MD', id: 'Moldova'},
            {code: 'MC', id: 'Monaco'},
            {code: 'MN', id: 'Mongolia'},
            {code: 'MS', id: 'Montserrat'},
            {code: 'MA', id: 'Morocco'},
            {code: 'MZ', id: 'Mozambique'},
            {code: 'MM', id: 'Myanmar'},
            {code: 'NA', id: 'Namibia'},
            {code: 'NR', id: 'Nauru'},
            {code: 'NP', id: 'Nepal'},
            {code: 'NL', id: 'Netherlands'},
            {code: 'AN', id: 'Netherlands Antilles'},
            {code: 'NC', id: 'New Caledonia'},
            {code: 'NZ', id: 'New Zealand'},
            {code: 'NI', id: 'Nicaragua'},
            {code: 'NE', id: 'Niger'},
            {code: 'NG', id: 'Nigeria'},
            {code: 'NU', id: 'Niue'},
            {code: 'NF', id: 'Norfolk Island'},
            {code: 'MP', id: 'Mariana Islands'},
            {code: 'NO', id: 'Norway'},
            {code: 'OM', id: 'Oman'},
            {code: 'PK', id: 'Pakistan'},
            {code: 'PW', id: 'Palau'},
            {code: 'PA', id: 'Panama'},
            {code: 'PG', id: 'Papua New Guinea'},
            {code: 'PY', id: 'Paraguay'},
            {code: 'PE', id: 'Peru'},
            {code: 'PH', id: 'Philippines'},
            {code: 'PL', id: 'Poland'},
            {code: 'PT', id: 'Portugal'},
            {code: 'PR', id: 'Puerto Rico'},
            {code: 'QA', id: 'Qatar'},
            {code: 'RE', id: 'Reunion'},
            {code: 'RO', id: 'Romania'},
            {code: 'RU', id: 'Russia'},
            {code: 'RW', id: 'Rwanda'},
            {code: 'SH', id: 'Saint Helena'},
            {code: 'KN', id: 'Saint Kitts And Nevis'},
            {code: 'LC', id: 'Saint Lucia'},
            {code: 'WS', id: 'Samoa'},
            {code: 'SM', id: 'San Marino'},
            {code: 'ST', id: 'Sao Tome And Principe'},
            {code: 'SA', id: 'Saudi Arabia'},
            {code: 'SN', id: 'Senegal'},
            {code: 'RS', id: 'Serbia'},
            {code: 'SC', id: 'Seychelles'},
            {code: 'SL', id: 'Sierra Leone'},
            {code: 'SG', id: 'Singapore'},
            {code: 'SK', id: 'Slovakia'},
            {code: 'SI', id: 'Slovenia'},
            {code: 'SB', id: 'Solomon Islands'},
            {code: 'SO', id: 'Somalia'},
            {code: 'ZA', id: 'South Africa'},
            {code: 'ES', id: 'Spain'},
            {code: 'LK', id: 'Sri Lanka'},
            {code: 'SD', id: 'Sudan'},
            {code: 'SR', id: 'Surinam'},
            {code: 'SZ', id: 'Swaziland'},
            {code: 'SE', id: 'Sweden'},
            {code: 'CH', id: 'Switzerland'},
            {code: 'SY', id: 'Syria'},
            {code: 'TW', id: 'Taiwan'},
            {code: 'TJ', id: 'Tajikistan'},
            {code: 'TZ', id: 'Tanzania'},
            {code: 'TH', id: 'Thailand'},
            {code: 'TG', id: 'Togo'},
            {code: 'TT', id: 'Trinidad And Tobago'},
            {code: 'TN', id: 'Tunisia'},
            {code: 'TR', id: 'Turkey'},
            {code: 'TM', id: 'Turkmenistan'},
            {code: 'TC', id: 'Turks And Caicos Islands'},
            {code: 'TV', id: 'Tuvalu'},
            {code: 'UG', id: 'Uganda'},
            {code: 'UA', id: 'Ukraine'},
            {code: 'AE', id: 'United Arab Emirates'},
            {code: 'GB', id: 'United Kingdom'},
            {code: 'US', id: 'USA'},
            {code: 'UY', id: 'Uruguay'},
            {code: 'UZ', id: 'Uzbekistan'},
            {code: 'VU', id: 'Vanuatu'},
            {code: 'VE', id: 'Venezuela'},
            {code: 'VN', id: 'Vietnam'},
            {code: 'WF', id: 'Wallis And Futuna'},
            {code: 'YE', id: 'Yemen'},
            {code: 'ZM', id: 'Zambia'},
            {code: 'ZW', id: 'Zimbabwe'}
        ];
	});
    
    
	// ---------
	// Externals
	// ---------

    return {

		start: function( ) {
			require(["dojo/domReady!"], function( ) {
				start( );
			});
		},
        initialize: function( ) { initialize(); },

		cb_play_route_zoom_level: function( ) { cb_play_route_zoom_level( ); },
		
		cb_click_fieldset_route: function( ) { cb_click_fieldset_route( ); },

		cb_map_pano_layout: function( layout ) { cb_map_pano_layout( layout ); },
		do_pause: function( ) { do_pause(); },
		do_stop:  function( ) { do_stop(); },

		cb_map_pegman_nb_img:   function(nb_img) { cb_map_pegman_nb_img(nb_img); },
		cb_map_pegman_img_size: function(size)   { cb_map_pegman_img_size(size); },

		cb_click_inc_dec_floating_pane: function(action, set)   { cb_click_inc_dec_floating_pane(action, set); },

		show_clear_place:  function( ) { show_clear_place(); },
		add_place:    function(name, formatted_address) { add_place(name, formatted_address); },

		do_save_gpx: 		 function( ) { do_save_gpx(); },
		do_create_gmaps_url: function( ) { do_create_gmaps_url(); },
		do_create_long_url:  function ( ) { do_create_long_url(); },
		do_create_short_url: function ( ) { do_create_short_url(); },
		
		move_to_dist: function( new_pos ) { move_to_dist( new_pos ); },

		cb_streetview_icon: function( ) { cb_streetview_icon(); },

		cb_route_input: function( ) { cb_route_input( ); },
		cb_route_input_mouse_enter: function( ) { cb_route_input_mouse_enter( ); },
		cb_route_input_mouse_leave: function( ) { cb_route_input_mouse_leave( ); },

		cb_waypoint_changed:     function( evt ) { cb_waypoint_changed( evt ); },

		cb_step_changed:     function( ) { cb_step_changed(); },
		cb_interval_changed: function( ) { cb_interval_changed(); },
		cb_play_route_zoom_level_changed: function( ) { cb_play_route_zoom_level_changed(); },
		cb_route_thickness_changed: function( ) { cb_route_thickness_changed(); },

		cb_map_style_changed:	function( ) { cb_map_style_changed(); },
		
		cb_show_tooltip_dollar:  function( ) { cb_show_tooltip_dollar( ); },
		cb_click_no_hwy:  function( ) { cb_click_no_hwy( ); },
		cb_click_no_toll: function( ) { cb_click_no_toll( ); },
		cb_set_map_type_id:  function( ) { cb_set_map_type_id( ); },

		cb_click_btn_drive_whole_route:	function( ) { cb_click_btn_drive_whole_route( ); },

		cb_open_settings: function( ) { cb_open_settings( ); },

		cb_copy_long_url: function( ) { cb_copy_long_url( ); },
		cb_copy_long_url_and_new_tab: function(  ) { cb_copy_long_url_and_new_tab(); },
		
		cb_change_google_maps_api_key: function( ) { cb_change_google_maps_api_key(); },
		cb_hide_google_maps_api_key: function( )   { cb_hide_google_maps_api_key(); },

		cb_change_starting_position: 			 function() { cb_change_starting_position(); },
		cb_change_autocomplete_type_restriction: function() { cb_change_autocomplete_type_restriction(); },
		cb_change_autocomplete_restrict_country: function() { cb_change_autocomplete_restrict_country(); },
		
		clear_settings: 	function( ) { clear_settings(); },
		
    };
 
});
