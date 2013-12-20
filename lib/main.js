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

  function updateUIStatus(status, msg) {
    port.emit('status', status, msg);
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
                self.data.url('js/angular-1.2.6.min.js'),
                self.data.url('js/ui.js')
              ]
            });
            port = worker.port;
            port.on('togglePauseResume', function () { processing = !processing; });
            port.on('maxParsers', function (parsers) { maxParsers = parsers; });
            port.emit('version', self.version);
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
    updateUIStatus('FollowerList',
                   'Loading follower list... (it should take less than one minute)');
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
        reProfileIDs = /^(?:,|\[\["tsg.lf",\[)\[\[,,"(\d{21})"\]$/gm,
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
    updateUIStatus('Cache', 'Loading data from cache...');
    for (i = 0; i < totalProfiles; i++) {
      profileID = profileIDs.shift();
      if (profileInfoFromCache = cache.get(profileID)) {
        emitProfile(profileInfoFromCache, false);
      } else {
        profileIDs.push(profileID);
      }
    }
  }

  function getProfilesInfoFromInternet() {
    getProfilesInfoFromCircleCount(); // and then from Google
  }

  function getProfilesInfoFromCircleCount() {
    var i = 0,
        howMany = profileIDs.length,
        infoFromCircleCount = {};
    updateUIStatus('CircleCount', 'Loading data from CircleCount...');
    function nextGroupForCircleCountAPI() {
      var ids = profileIDs.slice(i, i + 100).join(',');
      i += 100;
      Request({
        url: 'http://api.circlecount.com/gpfs.get.followers.php',
        content: {ids: ids},
        overrideMimeType: 'text/plain; charset=utf-8',
        onComplete: function (response) {
          var people,
              profile;
          if (response.status === 200) {
            try {
              people = JSON.parse(response.text).people;
            } catch (e) {}
            if (people) {
              for (j = 0, n = people.length; j < n; j++) {
                profile = people[j];
                infoFromCircleCount[profile.id] = profile;
              }
            }
          }
          if (i < howMany) {
            nextGroupForCircleCountAPI();
          } else {
            emitAndCacheProfilesInfoFromCircleCount(infoFromCircleCount);
            updateUIStatus('Google', 'Loading data from Google...');
            getProfilesInfoFromGoogle();
          }
        }
      }).get();
    }
    nextGroupForCircleCountAPI();
  }

  function emitAndCacheProfilesInfoFromCircleCount(infoCC) {
    var profileCC,
        profileInfo,
        i,
        howMany = profileIDs.length;
    for (i = 0; i < howMany; i++) {
      profileID = profileIDs.shift();
      if (profileCC = infoCC[profileID]) {
        profileInfo = {
          id: profileID,
          name: profileCC.fullname,
          followers: profileCC.followers || -1,
          source: 'C' // C = CircleCount
        }
        emitProfile(profileInfo, false);
        cache.set(profileID, profileInfo);
      } else {
        profileIDs.push(profileID);
      }
    }
  }

  function getProfilesInfoFromGoogle() {
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
          getProfilesInfoFromGoogle();
        } else {
          updateUIStatus('Completed', 'Processing completed!');
        }
      }
    }, 300);
  }

  function emitAndCacheProfileInfoFromGoogle(profileInfo) {
    emitProfile(profileInfo, true);
    cache.set(profileInfo.id, profileInfo);
    runningParsers--;
  }

  function emitProfile(profileInfo, fromScraping) {
    try {
      port.emit('profile', profileInfo, fromScraping);
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
              emitAndCacheProfileInfoFromGoogle(profileInfo);
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
          followers: -1,
          source: 'G' // G = Google
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
          emitAndCacheProfileInfoFromGoogle(profileInfo);
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
