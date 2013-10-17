function scopeApply(func) {
  angular.element(document.getElementById('container')).scope().$apply(func);
}

self.port.on('nameAndVersion', function (nameAndVersion) {
  scopeApply(function (scope) {
    scope.nameAndVersion = nameAndVersion;
  });
});

self.port.on('totalProfiles', function (totalProfiles) {
  scopeApply(function (scope) {
    scope.totalProfiles = totalProfiles;
    scope.timeZero = new Date();
  });
});

self.port.on('profile', function (profile) {
  scopeApply(function (scope) {
    var threshold,
        j,
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
    scope.timeLatest = new Date();
  });
});

var app = angular.module('gpfsApp', []);

function gpfsCtrl($scope) {
  $scope.currentPage = 1;
  $scope.profilesPerPage = 50;
  $scope.sortedProfiles = [];
  $scope.totalProfiles = 0;
  $scope.processing = true;
  $scope.maxParsers = 4;
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
  $scope.numOfPages = function () {
    return Math.ceil($scope.sortedProfiles.length/$scope.profilesPerPage) || 1;
  };
  $scope.remainingTime = function () {
    var profilesDone = $scope.sortedProfiles.length,
        avgTimePerProfile = ($scope.timeLatest - $scope.timeZero) / profilesDone,
        profilesToDo = $scope.totalProfiles - profilesDone;
    return Math.ceil(profilesToDo * avgTimePerProfile / 60000); // Minutes
  }
  $scope.togglePauseResume = function () {
    var elapsedTimeInPause;
    self.port.emit('togglePauseResume');
    $scope.processing = !$scope.processing;
    if (!$scope.processing) {
      $scope.timePause = new Date();
    } else {
      elapsedTimeInPause = new Date() - $scope.timePause;
      $scope.timeZero = new Date($scope.timeZero.getTime() + elapsedTimeInPause);
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

