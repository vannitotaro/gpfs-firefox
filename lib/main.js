/*
  Google Plus Follower Stats - Firefox Add-on
  Copyright 2012-2013 Giovanni Totaro (www.ingtotaro.it)
*/

(function () {

  var self = require('self'),
      tabs = require('tabs'),
      timers = require('timers'),
      Widget = require('widget').Widget,
      Request = require('request').Request,
      runningParsers = 0,
      profileIDs = [],
      tabVisible = false,
      remainingProfiles,
      port;

  Widget({
    id: 'gpfs',
    label: 'Google Plus Follower Stats',
    contentURL: self.data.url('img/gpfs.png'),
    onClick: function() {
      if (!tabVisible) {
        tabVisible = true;
        tabs.open({
          url: self.data.url('ui.html'),
          onReady: function (tab) {
            var worker = tab.attach({
              contentScriptFile: [
                //self.data.url('js/jquery-2.0.0.min.js'),
                self.data.url('js/underscore-1.4.4.min.js'),
                //self.data.url('js/bootstrap-2.3.1.min.js'),
                self.data.url('js/angular-1.1.5.min.js'),
                self.data.url('js/ui.js')
              ]
            });
            port = worker.port;
            port.emit('nameAndVersion', self.name + ' v' + self.version);
            getFollowers();
          },
          onClose: function () {
            tabVisible = false;
          }
        });
      }
    }
  });

  function getFollowers() {
    Request({
      url: 'https://plus.google.com/u/0/_/socialgraph/lookup/followers/',
      content: {m: '1000000'},
      overrideMimeType: 'text/plain; charset=utf-8',
      onComplete: function (response) {
        if (response.status === 200) {
          profileIDs = parseFollowers(response.text);
          if (profileIDs.length > 0) {
            getProfiles();
          }
          port.emit('totalProfiles', profileIDs.length);
          remainingProfiles = profileIDs.length;
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

  function getProfiles() {
    timers.setTimeout(function () {
      var i, profileID;
      for (i = runningParsers; i < 8; i++) {
        if (profileID = profileIDs.shift()) {
          getProfile(profileID);
        }
      }
      if (remainingProfiles > 0) {
        getProfiles();
      }
    }, 300);
  }

  function getProfile(profileID) {
    runningParsers++;
    Request({
      url: 'https://plus.google.com/u/0/' + profileID + '/about',
      overrideMimeType: 'text/plain; charset=utf-8',
      onComplete: function (response) {
        if (response.status === 200) {
          port.emit('profile', parseProfile(profileID, response.text));
          remainingProfiles--;
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
        if (result[1]) {
          profileFollowers = parseInt(result[1], 10);
        }
      }
    }
    return {
      id: profileID,
      followers: profileFollowers
    };
  }

})();
