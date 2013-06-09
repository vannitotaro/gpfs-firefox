function scopeApply(func) {
  angular.element(document.getElementById('container')).scope().$apply(func);
}

self.port.on('totalProfiles', function (totalProfiles) {
  scopeApply(function (scope) {
    if (totalProfiles > 0) {
      scope.totalProfiles = totalProfiles;
      scope.timeZero = new Date();
    } else {
      scope.loginProblem = true;
    }
  });
});

self.port.on('profile', function (profile) {
  scopeApply(function (scope) {
    var i = _.sortedIndex(scope.sortedProfiles, profile, function (p) { return -p.followers; });
    scope.sortedProfiles.splice(i, 0, profile);
    scope.timeLatest = new Date();
  });
});

var app = angular.module('gpfsApp', []);

function gpfsCtrl($scope) {
  $scope.loginProblem = false;
  $scope.currentPage = 1;
  $scope.pageSize = 20;
  $scope.sortedProfiles = [];
  $scope.totalProfiles = 0;
  $scope.numOfPages = function () {
    return Math.ceil($scope.sortedProfiles.length/$scope.pageSize) || 1;
  };
  $scope.remainingTime = function () {
    var profilesDone = $scope.sortedProfiles.length,
        avgTimePerProfile = ($scope.timeLatest - $scope.timeZero) / profilesDone,
        profilesToDo = $scope.totalProfiles - profilesDone;
    return Math.ceil(profilesToDo * avgTimePerProfile / 60000); // Minutes
  }
}

(function gapiLoop() {
  setTimeout(function () {
    if (typeof unsafeWindow.gapi !== 'undefined') {
      unsafeWindow.gapi.plus.go();
    }
    gapiLoop();
  }, 1000);
})();
