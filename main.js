
// Use Parse.Cloud.define to define as many cloud functions as you want.
// For example:

/* nexmo --------------------------- */
var nexmoAPI = require('cloud/lib/nexmoKey');

Parse.Cloud.define("verifyRequest", function (request, response) {
  Parse.Cloud.httpRequest({
    url: "https://api.nexmo.com/verify/json",
    method: "POST",
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'accept': 'application/json'
    },
    body: {
      "api_key": nexmoAPI.nexmoKey,
      "api_secret": nexmoAPI.nexmoSecret,
      "number": request.params.phoneNumber,
      "brand": "meepBee",
      "lg": "en-us"
    },
    success: function (httpResponse) {
      response.success(httpResponse.data);
    },
    error: function (httpResponse) {
      response.error(httpResponse.data);
    }
  });
});

Parse.Cloud.define("verifyCheck", function (request, response) {
  Parse.Cloud.httpRequest({
    url: "https://api.nexmo.com/verify/check/json",
    method: "POST",
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'accept': 'application/json'
    },
    body: {
      "api_key": nexmoAPI.nexmoKey,
      "api_secret": nexmoAPI.nexmoSecret,
      "request_id": request.params.request_id,
      "code": request.params.pinCode
    },
    success: function (httpResponse) {
      response.success(httpResponse.data);
    },
    error: function (httpResponse) {
      response.error(httpResponse.data);
    }
  });
});

Parse.Cloud.define('findFriendByPhones', function (request, response) {
  var promiseReqs = request.params.phones.map(function (phone) {
    var query = new Parse.Query(Parse.User);
    query.equalTo('mobile', phone);
    return query.first();
  });

  var promise = new Parse.Promise();
  Parse.Promise.when(promiseReqs).then(function () {
    var users = [].slice.call(arguments);
    users = users.filter(function (user) {
      return user && user.id !== request.user.id;
    });
    request.user.relation('friendsRelation').add(users);
    request.user.save().then(function () {
      response.success('ok');
    });
  });
});

Parse.Cloud.beforeDelete('Products', function (request, response) {
  console.log(request);
  response.error();
  //Prase.Cloud.httpRequest({
    //url: 'https://api.parse.com/1/files/' + request.video.name,
    //method: 'DELETE',
    //headers: {
    //},
  //})
});

Parse.Cloud.afterDelete('Products', function (request) {
  var productId = request.object.id;
  var activitesQuery = new Parse.Query('Activites');
  activitesQuery.equalTo('activityObject', request.object).find(function (activites) {
    Parse.Object.destroyAll(activites);
  });
});
