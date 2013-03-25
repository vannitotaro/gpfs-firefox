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
  var tableRow, i;
  tableRow = '<tr id="follower_' + profile.id + '"><td>' +
             (profile.followers === -1 ? "n/a" : profile.followers) +
             '</td><td><a href="https://plus.google.com/u/0/' +
             profile.id + '/about">'+ profile.fullName + '</td></tr>';
  for (i = 0;
       i < sortedProfiles.length &&
       profile.followers < sortedProfiles[i].followers;
       i++); // Yes, I know... a bsearch would be faster
  if (i == sortedProfiles.length) {
    $('#followers').append(tableRow);
  } else {
    $('#follower_' + sortedProfiles[i].id).before(tableRow);
  }
  sortedProfiles.splice(i, 0, profile);
  $('#progress').text(sortedProfiles.length);
  
});

self.port.on('finished', function() {
  $('#step-process-follower').removeClass('icon-hand-right').addClass('icon-ok');
});

