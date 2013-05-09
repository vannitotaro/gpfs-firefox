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
* Jump to page
* Stop parsing of profiles in getNextProfiles()
*/

var self = require('self'),
    tabs = require('tabs'),
    timers = require('timers'),
    Widget = require('widget').Widget,
    Request = require('request').Request,
    runningParsers = 0,
    profileIDs = [],
    intervalID;

function getFollowers(port) {
  Request({
    url: 'https://plus.google.com/u/0/_/socialgraph/lookup/followers/',
    content: {m: '1000000'},
    overrideMimeType: 'text/plain; charset=utf-8',
    onComplete: function (response) {
      if (response.status === 200) {
        profileIDs = parseFollowers(response.text);
        if (profileIDs.length > 0) {
          intervalID = timers.setInterval(getNextProfiles, 300, port);
        }
        port.emit('numOfProfiles', profileIDs.length);
      } /* else {
        // TODO: Check Internet connection
      } */
    }
  }).get();
}

function parseFollowers(followersPseudoJSON) {
  var profileIDs = [],
      reProfileIDs = /^,\[\[.*,"(\d{21})"]$/gm,
      result;
  while (result = reProfileIDs.exec(followersPseudoJSON)) {
    profileIDs.push(result[1]);
  }
  // profileIDs = profileIDs.slice(0, 50); // DEBUG
  return profileIDs;
}

function getNextProfiles(port) {
  var i;
  for (i = runningParsers; i < 8; i++) {
    getNextProfile(port);
  }
}

function getNextProfile(port) {
  var profileID = profileIDs.shift();
  if (profileID) {
    runningParsers++;
    getProfile(profileID, port);
  } else {
    timers.clearInterval(intervalID);
    port.emit('finished');
  }
}

function getProfile(profileID, port) {
  Request({
    url: 'https://plus.google.com/u/0/' + profileID + '/about',
    overrideMimeType: 'text/plain; charset=utf-8',
    onComplete: function (response) {
      if (response.status === 200) {
        port.emit('profile', parseProfile(profileID, response.text));
      } else {
        profileIDs.unshift(profileID);
        // console.log(response.toSource()); // DEBUG
      }
      runningParsers--;
    }
  }).get();
}

function parseProfile(profileID, profileAboutPage) {
  var reProfileFollowers = /^,\[(\d+),\[\[\"|^,\[0,\[\]/gm,
      result,
      profileFollowers = -1;
  if (reProfileFollowers.exec(profileAboutPage)) {
    // The second match is the good one
    if (result = reProfileFollowers.exec(profileAboutPage)) {
      profileFollowers = parseInt(result[1], 10);
    }
  }
  return {
    id: profileID,
    followers: profileFollowers
  };
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
        getFollowers(worker.port);
      }
    });
  }
});

