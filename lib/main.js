/*
  Google Plus Follower Stats - Firefox Add-on
  Copyright 2012-2014 Giovanni Totaro (www.ingtotaro.it)
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
      identities,
      identityIndex,
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
            port.on('identityIndex', function (index) {
              identityIndex = index;
              getFollowerList();
            });
            port.on('togglePauseResume', function () { processing = !processing; });
            port.on('maxParsers', function (parsers) { maxParsers = parsers; });
            port.emit('version', self.version);
            cache = new Cache(),
            processing = true;
            maxParsers = 8;
            getIdentities();
          },
          onClose: function () {
            tabVisible = false;
          }
        });
      }
    }
  });

  /***************************************************************************
     Google+ identities:
       GET https://plus.google.com/_/pages/getidentities/
       while logged in to Google+.

     Good lines format - ID:
       ,,,,"123456789012345678901",1,,[[,,,,[]

     Good lines format - Full Name:
       ,"NAME","SURNAME","FULL NAME",0]
   ***************************************************************************/

  function getIdentities() {
    updateUIStatus('Identities',
                   'Loading Google+ identities... (it should take a few seconds)');
    identities = [];
    Request({
      url: 'https://plus.google.com/_/pages/getidentities/',
      overrideMimeType: 'text/plain; charset=utf-8',
      onComplete: function (response) {
        var reID = /"(\d{21})"/gm,
            reFullName = /^,"[^"]*","[^"]*","([^"]*)",\d*]$/gm,
            mustRetry = true,
            ids = [],
            fullNames = [],
            result,
            i,
            n;
        if (response.status === 200) {
          while (result = reID.exec(response.text)) {
            ids.push(result[1]);
          }
          while (result = reFullName.exec(response.text)) {
            fullNames.push(result[1]);
          }
          if (ids.length > 0) {
            mustRetry = false;
            if (ids.length === fullNames.length) {
              for (i = 0, n = ids.length; i < n; i++) {
                identities[i] = {
                  'ID': ids[i],
                  'FullName': fullNames[i]
                }
              }
              port.emit('identities', identities);
              updateUIStatus('Choice', '');
            } else { // Fallback to default Google+ account
              getFollowerList();
            }
          }
        }
        if (mustRetry && tabVisible) {
          timers.setTimeout(
            function () {
              getIdentities(callback);
            },
            1000
          );
        }
      }
    }).get();
  }

  function identityURL() {
    var URL = '';
    if (identities.length > 0 && identityIndex > 0) {
      URL = 'b/' + identities[identityIndex]['ID'] + '/';
    }
    return URL;
  }

  function getFollowerList() {
    var followerSet = {};
    profileIDs = [];
    getFollowersDataSource1(followerSet, function () {
      getFollowersDataSource2(followerSet, function () {
        getFollowersDataSource3(followerSet, function () {
          for (profileID in followerSet) {
            profileIDs.push(profileID);
          }
          remainingProfiles = profileIDs.length;
          try {
            port.emit('totalProfiles', remainingProfiles);
          } catch (e) {}
          getProfilesInfo();
        });
      });
    });
  }

  /***************************************************************************
     Follower list data source #1:
       GET https://plus.google.com/[b/GOOGLEPLUSID/]_/socialgraph/lookup/followers/?m=1000000
       while logged in to Google+.

     Good lines format:
       [["tsg.lf",[[[,,"123456789012345678901"]
       ,[[,,"123456789012345678901"]
   ***************************************************************************/

  function getFollowersDataSource1(followerSet, callback) {
    updateUIStatus('FollowerList',
                   'Loading follower list from data source 1 of 3... (it should take less than one minute)');
    Request({
      url: 'https://plus.google.com/' + identityURL() + '_/socialgraph/lookup/followers/',
      content: {m: '1000000'},
      overrideMimeType: 'text/plain; charset=utf-8',
      onComplete: function (response) {
        var reProfileIDs = /^(?:,|\[\["tsg.lf",\[)\[\[,,"(\d{21})"\]$/gm,
            result;
        if (response.status === 200) {
          while (result = reProfileIDs.exec(response.text)) {
            followerSet[result[1]] = true;
          }
          callback();
        } else if (tabVisible) {
          timers.setTimeout(
            function () {
              getFollowersDataSource1(followerSet, callback);
            },
            1000
          );
        }
      }
    }).get();
  }

  /***************************************************************************
     Follower list data source #2:
       GET 'https://plus.google.com/_/socialgraph/lookup/incoming/?o=%5Bnull%2Cnull%2C%22GOOGLEPLUSID%22%5D&n=1000000&rt=j

     Good lines format:
       ,[[[,,"123456789012345678901"]
       ,[[,,"123456789012345678901"]
   ***************************************************************************/

  function getFollowersDataSource2(followerSet, callback) {
    updateUIStatus('FollowerList',
                   'Loading follower list from data source 2 of 3... (it should take less than one minute)');
    if (identities.length > 0) {
      Request({
        url: 'https://plus.google.com/_/socialgraph/lookup/incoming/',
        content: {
          o: '[null,null,"' + identities[identityIndex]['ID'] + '"]',
          n: '1000000',
          rt: 'j'
        },
        overrideMimeType: 'text/plain; charset=utf-8',
        onComplete: function (response) {
          var reProfileIDs = /^,\[\[\[?,,"(\d{21})"\]$/gm,
              result;
          if (response.status === 200) {
            while (result = reProfileIDs.exec(response.text)) {
              followerSet[result[1]] = true;
            }
            callback();
          } else if (tabVisible) {
            timers.setTimeout(
              function () {
                getFollowersDataSource2(followerSet, callback);
              },
              1000
            );
          }
        }
      }).get();
    } else {
      callback();
    }
  }

  /***************************************************************************
     Follower list data source #3:
       GET https://plus.google.com/[b/GOOGLEPLUSID/]people/haveyou?hl=en
       while logged in to Google+.

     Good line fragments format:
       ["ppv.psn",[[,,"123456789012345678901"]
       ["ppv.psn",[["EMAIL",,"123456789012345678901"]
   ***************************************************************************/

  function getFollowersDataSource3(followerSet, callback) {
    updateUIStatus('FollowerList',
                   'Loading follower list from data source 3 of 3... (it should take less than one minute)');
    Request({
      url: 'https://plus.google.com/' + identityURL() + 'people/haveyou',
      content: {hl: 'en'},
      overrideMimeType: 'text/plain; charset=utf-8',
      onComplete: function (response) {
        var reProfileIDs = /\["ppv.psn",\[\["?[^"]*"?,,"(\d{21})"\]/gm,
            result;
        if (response.status === 200) {
          while (result = reProfileIDs.exec(response.text)) {
            followerSet[result[1]] = true;
          }
          callback();
        } else if (tabVisible) {
          timers.setTimeout(
            function () {
              getFollowersDataSource3(followerSet, callback);
            },
            1000
          );
        }
      }
    }).get();
  }

  function getProfilesInfo() {
    getProfilesInfoFromCache();
    getProfilesInfoFromCircleCountAndGoogle();
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

  function getProfilesInfoFromCircleCountAndGoogle() {
    var i = 0,
        howMany = profileIDs.length,
        infoFromCircleCount = {};
    function nextGroupForCircleCountAPI() {
      updateUIStatus(
        'CircleCount',
        'Loading data from CircleCount (' + Math.round(100 * i / howMany)  + '%)...'
      );
      var ids = profileIDs.slice(i, i + 100).join(',');
      i += 100;
      Request({
        url: 'http://api.circlecount.com/gpfs.get.followers.php',
        content: {ids: ids},
        overrideMimeType: 'text/plain; charset=utf-8',
        onComplete: function (response) {
          var people,
              profile,
              j,
              n;
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
          if (i < howMany && tabVisible) {
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
          updateUIStatus('Completed', '');
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
