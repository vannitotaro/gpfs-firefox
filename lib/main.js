/*
  Google Plus Follower Stats - Firefox Add-on
  Copyright 2012-2013 Giovanni Totaro (www.ingtotaro.it)
*/

/*
---------TODO---------
* Add author and Google+ badge
* Change icon
* Avoid re-click on icon
* Check if profile request failed ([ ]captcha or [X]connection error)
* Save data?
* Handle re-execution
* Check Internet Connection
* Add follower profile photos
*/

var self = require('self'),
    tabs = require('tabs'),
    timers = require('timers'),
    Widget = require('widget').Widget,
    Request = require('request').Request,
    runningParsers = 0,
    profileIDs = [],
    intervalID;

function parseFollowers(followersPseudoJSON) {
  var profileIDs = [],
      regExpProfileIDs = /^,\[\[.*,"(\d{21})"]$/gm,
      result;
  while (result = regExpProfileIDs.exec(followersPseudoJSON)) {
    profileIDs.push(result[1]);
  }
  profileIDs = profileIDs.slice(0, 50); // DEBUG
  return profileIDs;
}

function parseProfiles(port) {
  var i;
  for (i = runningParsers; i < 8; i++) {
    parseProfile(port);
  }
}

function parseProfile(port) {
  var profileID = profileIDs.shift();
  if (profileID) {
    runningParsers++;
    Request({
      url: 'https://plus.google.com/u/0/' + profileID + '/about',
      overrideMimeType: 'text/plain; charset=utf-8',
      onComplete: function (response) {
        var profileAboutPage = response.text,
            regExpProfileFollowers = /^,\[(\d+),\[\[\"|^,\[0,\[\]/gm,
            result,
            profileFollowers = -1,
            profile;
        if (response.status === 200) {
          if (regExpProfileFollowers.exec(profileAboutPage)) {
            // The second match is the good one
            result = regExpProfileFollowers.exec(profileAboutPage);
            if (result) {
              profileFollowers = parseInt(result[1], 10);
            }
          }
          profile = {
            id: profileID,
            followers: profileFollowers
          };
          port.emit('profile', profile);
        } else {
          profileIDs.unshift(profileID);
          // console.log(response.toSource()); // DEBUG
        }
        runningParsers--;
      }
    }).get();
  } else {
    timers.clearInterval(intervalID);
    port.emit('finished');
  }
}

Widget({
  id: 'gpfs',
  label: 'Google Plus Follower Stats',
  contentURL: self.data.url('img/icon.png'),
  onClick: function() {
    tabs.open({
      url: self.data.url('ui.html'),
      onReady: function (tab) {
        var worker = tab.attach({
          contentScriptFile: [
            self.data.url('js/jquery-2.0.0.min.js'),
            self.data.url('js/underscore-1.4.4.min.js'),
            //self.data.url('js/bootstrap-2.3.1.min.js'),
            self.data.url('js/angular-1.1.4.min.js'),
            self.data.url('js/ui.js')
          ]
        });
        Request({
          url: 'https://plus.google.com/u/0/_/socialgraph/lookup/followers/',
          content: {m: '1000000'},
          overrideMimeType: 'text/plain; charset=utf-8',
          onComplete: function (response) {
            if (response.status === 200) {
              profileIDs = parseFollowers(response.text);
              if (profileIDs.length > 0) {
                intervalID = timers.setInterval(parseProfiles, 300, worker.port);
              }
              worker.port.emit('numOfProfiles', profileIDs.length);
            } /* else {
              // TODO: Check Internet connection
            } */
          }
        }).get();
      }
    });
  }
});

