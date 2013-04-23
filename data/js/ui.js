var sortedProfiles = [];

self.port.on('total', function(total) {
  if (total > 0) {
    $('#total').text(total);
    $('#step-check-logged').removeClass('icon-hand-right').addClass('icon-ok');
    $('#step-download-list').removeClass('icon-asterisk').addClass('icon-ok');
    $('#step-process-follower').removeClass('icon-asterisk').addClass('icon-hand-right');
  } else {
    $('#step-check-logged').removeClass('icon-hand-right').addClass('icon-warning-sign');
  }
});

self.port.on('profile', function(profile) {
  var i = _.sortedIndex(sortedProfiles, profile, function (p) { return -p.followers; });
  sortedProfiles.splice(i, 0, profile);
  angular.element($("#container")).scope().$apply(function(scope){
    scope.sortedProfiles = sortedProfiles;
  })
});

self.port.on('finished', function() {
  $('#step-process-follower').removeClass('icon-hand-right').addClass('icon-ok');
});

var app = angular.module('GpfsApp', []);

function GpfsCtrl($scope) {
  $scope.currentPage = 0;
  $scope.pageSize = 10;
  $scope.sortedProfiles = [];
  $scope.numberOfPages = function () {
    return Math.ceil($scope.sortedProfiles.length/$scope.pageSize);
  }
  $scope.notAvailable = function (followers) {
    return followers === -1 ? "n/a" : followers;
  }
}
