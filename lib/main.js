/*
  Google Plus Follower Stats - Firefox Add-on
  Copyright 2012-2013 Giovanni Totaro (www.ingtotaro.it)
*/

(function () {

  var self = require('sdk/self'),
      tabs = require('sdk/tabs'),
      timers = require('sdk/timers'),
      Widget = require('sdk/widget').Widget,
      Request = require('sdk/request').Request,
      runningParsers = 0,
      tabVisible = false,
      cache,
      processing,
      maxParsers,
      profileIDs,
      remainingProfiles,
      port;

  function Cache() {
    var ss = require('sdk/simple-storage'),
        sss = ss.storage,
        now = Date.now();
    if (sss.cache) {
      // Delete cache entries older than 1 day
      for (key in sss.cache) {
        if (now - sss.cache[key][0] > 86400000) { // 86400000 ms = 1 day
          delete sss.cache[key];
        }
      }
    } else {
      // Create cache
      sss.cache = {};
    }
    this.set = function (key, value) {
      sss.cache[key] = [Date.now(), value];
    };
    this.get = function (key) {
      var timestamp_value,
          value;
      if (timestamp_value = sss.cache[key]) {
        value = timestamp_value[1];
      }
      return value;
    };
  }

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
                self.data.url('js/angular-1.2.0-rc3.min.js'),
                self.data.url('js/ui.js')
              ]
            });
            port = worker.port;
            port.on('togglePauseResume', function () { processing = !processing; });
            port.on('maxParsers', function (parsers) { maxParsers = parsers; });
            port.emit('nameAndVersion', self.name + ' v' + self.version);
            cache = new Cache(),
            processing = true;
            maxParsers = 4;
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
        var mustRetry = true;
        if (response.status === 200) {
          profileIDs = parseFollowers(response.text);
          if (profileIDs.length > 0) {
            remainingProfiles = profileIDs.length;
            try {
              port.emit('totalProfiles', remainingProfiles);
            } catch (e) {}
            getProfilesInfo();
            mustRetry = false;
          }
        }
        if (mustRetry && tabVisible) {
          timers.setTimeout(getFollowers, 1000);
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
    getProfilesInfoFromCache();
    getProfilesInfoFromInternet();
  }

  function getProfilesInfoFromCache() {
    var i,
        profileID,
        profileInfoFromCache,
        totalProfiles = profileIDs.length;
    for (i = 0; i < totalProfiles; i++) {
      profileID = profileIDs.shift();
      if (profileInfoFromCache = cache.get(profileID)) {
        emitProfile(profileInfoFromCache, true);
      } else {
        profileIDs.push(profileID);
      }
    }
  }

  function getProfilesInfoFromInternet() {
    timers.setTimeout(function () {
      var i,
          profileID;
      if (tabVisible) {
        if (processing) {
          for (i = runningParsers; i < maxParsers; i++) {
            if (profileID = profileIDs.shift()) {
              getProfileInfoBasicApp(profileID);
            }
          }
        }
        if (remainingProfiles > 0) {
          getProfilesInfoFromInternet();
        }
      }
    }, 300);
  }

  function emitAndCacheProfileInfoFromInternet(profileInfo) {
    emitProfile(profileInfo, false);
    cache.set(profileInfo.id, profileInfo);
    runningParsers--;
  }

  function emitProfile(profileInfo, fromCache) {
    try {
      port.emit('profile', profileInfo, fromCache);
    } catch (e) {}
    remainingProfiles--;
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
          if (profileInfo.name) {
            if (profileInfo.followers !== -1) {
              emitAndCacheProfileInfoFromInternet(profileInfo);
            } else {
              getProfileInfoFullApp(profileInfo);
            }
            return;
          }
        }
        scheduleProfileRetry(profileID);
      }
    }).get();
  }

  function parseProfileBasicApp(profileID, profileAboutPage) {
    var reProfileName = /<div class="z8">([^<]+)/,
        reProfileFollowers = /<div id="392" [^>]*>[^<]*<span [^>]*>(\d+)/,
        profile = {
          id: profileID,
          name: '',
          followers: -1
        },
        result;
    if (result = reProfileName.exec(profileAboutPage)) {
      profile.name = result[1];
      if (result = reProfileFollowers.exec(profileAboutPage)) {
        profile.followers = parseInt(result[1], 10);
      }
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
          emitAndCacheProfileInfoFromInternet(profileInfo);
        } else {
          scheduleProfileRetry(profileInfo.id);
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
