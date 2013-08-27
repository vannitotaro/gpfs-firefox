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
      tabVisible = false,
      profileIDs,
      remainingProfiles,
      port;

  Widget({
    id: 'gpfs',
    label: 'Google Plus Follower Stats',
    contentURL: self.data.url('img/gpfs.png'),
    onClick: function() {
      if (!tabVisible && runningParsers == 0) {
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
      url: 'https://plus.google.com/_/socialgraph/lookup/followers/',
      content: {m: '1000000'},
      overrideMimeType: 'text/plain; charset=utf-8',
      onComplete: function (response) {
        if (response.status === 200) {
          profileIDs = parseFollowers(response.text);
          remainingProfiles = profileIDs.length;
          try {
            port.emit('totalProfiles', remainingProfiles);
          } catch (e) {}
          if (remainingProfiles > 0) {
            getProfiles();
          }
        } /* else {
          // TODO: Check Internet connection
        } */
      }
    }).get();
  }

  function parseFollowers(followersPseudoJSON) {
    var profileIDs = [],
        reProfileIDs = /^,\[\[.*,"(\d{21})"\]$/gm,
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
      if (tabVisible) {
        for (i = runningParsers; i < 8; i++) {
          if (profileID = profileIDs.shift()) {
            getProfile(profileID);
          }
        }
        if (remainingProfiles > 0) {
          getProfiles();
        }
      }
    }, 300);
  }

  function getProfile(profileID) {
    runningParsers++;
    Request({
      url: 'https://plus.google.com/app/basic/' + profileID + '/about',
      overrideMimeType: 'text/plain; charset=utf-8',
      onComplete: function (response) {
        if (response.status === 200) {
          try {
            port.emit('profile', parseProfile(profileID, response.text));
          } catch (e) {}
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
    var reProfileName = /<div class="J0UdHd">([^<]+)/,
        reProfileFollowers = /<div id="392" [^>]*>[^<]*<span [^>]*>(\d+)/,
        reProfilePhoto = /<img src="([^"]+)" class="s0tame"/,
        reProfileCircles = /data-circlecount="(\d+)"/,
        profile = {
          id: profileID,
          name: "?",
          followers: -1,
          photo: "",
          circles: -1
        },
        result;
    if (result = reProfileName.exec(profileAboutPage)) {
      profile.name = result[1];
    }
    if (result = reProfileFollowers.exec(profileAboutPage)) {
      profile.followers = parseInt(result[1], 10);
    }
    if (result = reProfilePhoto.exec(profileAboutPage)) {
      profile.photo = 'http:' + result[1];
    }
    if (result = reProfileCircles.exec(profileAboutPage)) {
      profile.circles = parseInt(result[1], 10);
    }
    return profile;
  }

})();
