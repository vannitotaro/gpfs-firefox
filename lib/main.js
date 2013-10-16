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
      processing = true,
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
                self.data.url('js/underscore-1.5.2.min.js'),
                self.data.url('js/angular-1.2.0-rc2.min.js'),
                self.data.url('js/ui.js')
              ]
            });
            port = worker.port;
            port.on('togglePauseResume', function () { processing = !processing; });
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
            getProfilesInfo();
          }
        } else {
          try {
            port.emit('totalProfiles', 0);
          } catch (e) {}
        }
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
    return profileIDs;
  }

  function getProfilesInfo() {
    timers.setTimeout(function () {
      var i, profileID;
      if (tabVisible) {
        if (processing) {
          for (i = runningParsers; i < 32; i++) {
            if (profileID = profileIDs.shift()) {
              getProfileInfoBasicApp(profileID);
            }
          }
        }
        if (remainingProfiles > 0) {
          getProfilesInfo();
        }
      }
    }, 300);
  }

  function emitProfile(profileInfo) {
    try {
      port.emit('profile', profileInfo);
    } catch (e) {}
    remainingProfiles--;
    runningParsers--;
  }

  function scheduleProfileRetry(profileID) {
    profileIDs.push(profileID);
    runningParsers--;
  }

  function getProfileInfoBasicApp(profileID) {
    runningParsers++;
    Request({
      url: 'https://plus.google.com/app/basic/' + profileID + '/about',
      content: {hl: 'en'},
      overrideMimeType: 'text/plain; charset=utf-8',
      onComplete: function (response) {
        var profileInfo;
        if (response.status === 200) {
          profileInfo = parseProfileBasicApp(profileID, response.text);
          if (profileInfo.followers !== -1) {
            emitProfile(profileInfo);
          } else {
            getProfileInfoFullApp(profileInfo);
          }
        } else {
          scheduleProfileRetry(profileID);
          // console.log(response.toSource()); // DEBUG
        }
      }
    }).get();
  }

  function parseProfileBasicApp(profileID, profileAboutPage) {
    var reProfileName = /<div class="z8">([^<]+)/,
        reProfileFollowers = /<div id="392" [^>]*>[^<]*<span [^>]*>(\d+)/,
        reProfileCircles = /data-circlecount="(\d+)"/,
        profile = {
          id: profileID,
          name: '?',
          followers: -1,
          circles: -1
        },
        result;
    if (result = reProfileName.exec(profileAboutPage)) {
      profile.name = result[1];
    }
    if (result = reProfileFollowers.exec(profileAboutPage)) {
      profile.followers = parseInt(result[1], 10);
    }
    if (result = reProfileCircles.exec(profileAboutPage)) {
      profile.circles = parseInt(result[1], 10);
    }
    return profile;
  }

  function getProfileInfoFullApp(profileInfo) {
    Request({
      url: 'https://plus.google.com/' + profileInfo.id + '/about',
      content: {hl: 'en'},
      overrideMimeType: 'text/plain; charset=utf-8',
      onComplete: function (response) {
        if (response.status === 200) {
          parseProfileFullApp(profileInfo, response.text);
          emitProfile(profileInfo);
        } else {
          scheduleProfileRetry(profileInfo.id);
          // console.log(response.toSource()); // DEBUG
        }
      }
    }).get();
  }

  function parseProfileFullApp(profileInfo, profileAboutPage) {
    var reProfileFollowers = />Have [a-z]+ in circles[^>]+>[^>]+>[^>]+>([\d,]+) people</,
        result;
    if (result = reProfileFollowers.exec(profileAboutPage)) {
      profileInfo.followers = parseInt(result[1].replace(/,/g, ''), 10);
    }
  }

})();
