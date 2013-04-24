function scopeApply(func) {
  angular.element($("#container")).scope().$apply(func);
}

self.port.on('numOfProfiles', function (numOfProfiles) {
  if (numOfProfiles > 0) {
    scopeApply(function (scope) { scope.totalProfiles = numOfProfiles; });
    $('#step-check-logged').removeClass('icon-hand-right').addClass('icon-ok');
    $('#step-download-list').removeClass('icon-asterisk').addClass('icon-ok');
    $('#step-process-follower').removeClass('icon-asterisk').addClass('icon-hand-right');
  } else {
    $('#step-check-logged').removeClass('icon-hand-right').addClass('icon-warning-sign');
  }
});

self.port.on('profile', function (profile) {
  scopeApply(function (scope) {
    var i = _.sortedIndex(scope.sortedProfiles, profile, function (p) { return -p.followers; });
    scope.sortedProfiles.splice(i, 0, profile);
  });
});

self.port.on('finished', function () {
  $('#step-process-follower').removeClass('icon-hand-right').addClass('icon-ok');
});

var app = angular.module('gpfsApp', []);

function gpfsCtrl($scope) {
  $scope.currentPage = 0;
  $scope.pageSize = 20;
  $scope.sortedProfiles = [];
  $scope.totalProfiles = 0;
  $scope.numOfPages = function () {
    return Math.ceil($scope.sortedProfiles.length/$scope.pageSize) || 1;
  }
}
