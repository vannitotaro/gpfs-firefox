/*
  Google Plus Follower Stats - Firefox Add-on
  Copyright 2012-2014 Giovanni Totaro (www.ingtotaro.it)
*/

var BADGES_URL = 'http://www.ingtotaro.it/projects/gpfs-firefox/badges.html#';

function getScope() {
  return angular.element(document.getElementById('container')).scope();
}

// Periodic UI refresh while processing profiles
function refreshUI() {
  window.setTimeout(function () {
    var scope = getScope(),
        completed = (scope.sortedProfiles.length === scope.totalProfiles);
    if (scope.processing || completed) {
      scope.$apply();
    }
    if (!completed) {
      refreshUI();
    }
  }, 5000);
};

self.port.on('version', function (version) {
  getScope().$apply(function (scope) {
    scope.version = version;
  });
});

self.port.on('identities', function (identities) {
  getScope().$apply(function (scope) {
    scope.identities = identities;
  });
});

self.port.on('status', function (status, msg) {
  getScope().$apply(function (scope) {
    scope.status = status;
    scope.statusMessage = msg;
    if (status === 'Google') {
      scope.timeZero = Date.now();
    }
  });
});

self.port.on('totalProfiles', function (totalProfiles) {
  getScope().$apply(function (scope) {
    scope.totalProfiles = totalProfiles;
  });
  refreshUI(); // Start periodic UI refresh
});

self.port.on('profile', function (profile, fromScraping) {
  var threshold,
      j,
      scope = getScope(),
      pf = profile.followers,
      i = _.sortedIndex(scope.sortedProfiles, profile,
                        function (p) {return -p.followers;});
  scope.sortedProfiles.splice(i, 0, profile);
  for (j = 0; j < scope.breakdownThresholds.length; j++) {
    if (pf >= scope.breakdownThresholds[j]) {
      scope.breakdown[j]++;
      break;
    }
  }
  if (fromScraping) {
    scope.timeLatest = Date.now();
  } else {
    scope.profilesNotFromScraping++;
  }
});

var app = angular.module('gpfsApp', []).config(
  function($sceDelegateProvider) {
    $sceDelegateProvider.resourceUrlWhitelist([
      'self',
      BADGES_URL + '**'
    ]);
  }
);

function gpfsCtrl($scope, $timeout) {
  $scope.status = '';
  $scope.statusMessage = '';
  $scope.currentPage = 1;
  $scope.profilesPerPage = 30;
  $scope.sortedProfiles = [];
  $scope.totalProfiles = 0;
  $scope.profilesNotFromScraping = 0;
  $scope.showFollowerHistory = {};
  $scope.showBadges = true;
  $scope.processing = true;
  $scope.maxParsers = 8;
  $scope.breakdownLabels = [
    'at least 1,000,000',
    '100,000 ÷ 999,999',
    '10,000 ÷ 99,999',
    '1,000 ÷ 9,999',
    '100 ÷ 999',
    '10 ÷ 99',
    '1 ÷ 9',
    '0 or n/a'
  ]
  $scope.breakdownThresholds = [1000000, 100000, 10000, 1000, 100, 10, 1, -1];
  $scope.breakdown = [0, 0, 0, 0, 0, 0, 0, 0];
  $scope.breakdownPerc = function (i) {
    return ($scope.breakdown[i] * 100 / $scope.sortedProfiles.length).toFixed(2) + "%";
  }
  $scope.chooseIdentity = function (index) {
    $scope.identityIndex = index;
    self.port.emit('identityIndex', index);
  }
  $scope.numOfPages = function () {
    return Math.ceil($scope.sortedProfiles.length/$scope.profilesPerPage) || 1;
  };
  $scope.remainingTime = function () {
    var remaining,
        profilesDone = $scope.sortedProfiles.length,
        avgTimePerProfile = ($scope.timeLatest - $scope.timeZero) /
                            (profilesDone - $scope.profilesNotFromScraping),
        profilesToDo = $scope.totalProfiles - profilesDone,
        remainingMinutes = Math.ceil(profilesToDo * avgTimePerProfile / 60000);
    if (remainingMinutes <= 1) {
      remaining = 'less than one minute';
    } else if (remainingMinutes <= 60) {
      remaining = remainingMinutes + ' minutes';
    } else {
      remaining = 'less than ' + Math.ceil(remainingMinutes / 60) + ' hours';
    }
    return remaining;
  }
  $scope.setCurrentPage = function (currentPage) {
    $scope.currentPage = currentPage;
  }
  $scope.visibleProfiles = function () {
    return $scope.sortedProfiles.slice(
             ($scope.currentPage - 1) * $scope.profilesPerPage,
             $scope.currentPage * $scope.profilesPerPage
           );
  }
  $scope.badges = function () {
    var ids = [p.id for each (p in $scope.visibleProfiles())].join(',');
    return BADGES_URL + ids;
  }
  $scope.toggleBadges = function () {
    $scope.showBadges = !$scope.showBadges;
  }
  $scope.togglePauseResume = function () {
    self.port.emit('togglePauseResume');
    $scope.processing = !$scope.processing;
    if (!$scope.processing) {
      $scope.timePause = Date.now();
    } else {
      $scope.timeZero += Date.now() - $scope.timePause;
    }
  }
  $scope.speedDown = function () {
    $scope.maxParsers /= 2;
    self.port.emit('maxParsers', $scope.maxParsers);
  }
  $scope.speedUp = function () {
    $scope.maxParsers *= 2;
    self.port.emit('maxParsers', $scope.maxParsers);
  }
}


