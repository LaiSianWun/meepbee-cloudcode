
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

Parse.Cloud.afterDelete('Products', function (request) {
  var productId = request.object.id;
  var activitesQuery = new Parse.Query('Activites');
  activitesQuery.equalTo('activityObject', request.object).find(function (activites) {
    Parse.Object.destroyAll(activites);
  });
  var messagesQuery = new Parse.Query('Messages');
  messagesQuery.equalTo('product', request.object).find(function (messages){
    Parse.Object.destroyAll(messages);
  });
  var commentsQuery = new Parse.Query('Comments');
  commentsQuery.equalTo('product', request.object).find(function (comments) {
    Parse.Object.destroyAll(comments);
  });
  var likesQuery = new Parse.Query('Likes');
  likesQuery.equalTo('likedProduct', request.object).find(function (likes) {
    Parse.Object.destroyAll(likes);
  });

  var images = request.object.get('images');
  var deleteImagesReqs = images.map(function (image) {
    return Parse.Cloud.httpRequest({
      method: 'DELETE',
      url: image.url(),
      headers: {
        "X-Parse-Application-Id": "DHPbawPXsk9VM697XtD0UNuYAuaxuxc8tEXoIquY",
        "X-Parse-Master-Key": "gHSj9XICI4DxlHD89WCzWn1ki77foPucPBAqil6p"
      }
    });
  });
  Parse.Promise.when(images);
  var video = request.object.get('video');
  Parse.Cloud.httpRequest({
    method: 'DELETE',
    url: video.url(),
    headers: {
      "X-Parse-Application-Id": "DHPbawPXsk9VM697XtD0UNuYAuaxuxc8tEXoIquY",
      "X-Parse-Master-Key": "gHSj9XICI4DxlHD89WCzWn1ki77foPucPBAqil6p"
    }
  });
  var thumbnailImages = request.object.get('thumbnailImages');
  var deleteThumbnailImagesReqs = thumbnailImages.map(function (thumbnailImage) {
    return Parse.Cloud.httpRequest({
      method: 'DELETE',
      url: thumbnailImage.url(),
      headers: {
        "X-Parse-Application-Id": "DHPbawPXsk9VM697XtD0UNuYAuaxuxc8tEXoIquY",
        "X-Parse-Master-Key": "gHSj9XICI4DxlHD89WCzWn1ki77foPucPBAqil6p"
      }
    });
  });
  deleteThumbnailImagesReqs.shift();
  Parse.Promise.when(deleteThumbnailImagesReqs);
});

Parse.Cloud.afterDelete('Messages', function (request) {
  var chatsQuery = new Parse.Query('Chats');
  chatsQuery.equalTo('chatRoomId', request.object.chatRoomId);
});

Parse.Cloud.define('getProductById', function (request, response) {
  var productsQuery = new Parse.Query('Products');
  var commentsQuery = new Parse.Query('Comments');
  var likesQuery = new Parse.Query('Likes');
  var productContainer = {};
  productContainer.liked = false;
  productsQuery.include('seller');
  productsQuery.get(request.params.productId).then(function (product) {
    var commentsPromise = commentsQuery.equalTo('product', product).find()
    var likesPromise = likesQuery.equalTo('likedProduct', product).find()
    productContainer.product = product;
    return Parse.Promise.when([commentsPromise, likesPromise])
  }).then(function (comments, likes) {
    productContainer.comments = comments;
    productContainer.likes = likes;
    if (request.user && request.user.id) {
      likes.forEach(function (like) {
        if(like.get('likedUser').id === request.user.id) productContainer.liked = true;
      })
    }
    response.success(productContainer);
  });
})

Parse.Cloud.define('getProductsByUser', function (request, response) {
  var userId = request.params.userId;
  var productsQuery = new Parse.Query('Products');
  var commentsQuery = new Parse.Query('Comments');
  var likesQuery = new Parse.Query('Likes');
  productsQuery.equalTo('seller', userId);
  productsQuery.find().then(function (products) {
    response.success(products);
  })
});

Parse.Cloud.define('productWithRelated', function (request, response) {
  var skip = request.params.skip || 0;
  var limit = request.params.limit || 10;
  var productsQuery = new Parse.Query('Products');

  productsQuery
    .limit(limit)
    .skip(skip)
    .include('seller')
    .descending('createdAt');
  productsQuery.find().then(function (products) {
    var likes = null;
    var comments = null;
    var likeQueries = products.map(function (product) {
      var likesQuery = new Parse.Query('Likes');
      likesQuery.equalTo('likedProduct', product);
      return likesQuery.find();
    })

    var commentQueries = products.map(function (product) {
      var commentsQuery = new Parse.Query('Comments');
      commentsQuery.equalTo('product', product);
      return commentsQuery.find();
    })

    Parse.Promise.when(likeQueries).then(function () {
      likes = [].slice.call(arguments);
      return Parse.Promise.when(commentQueries);
    }).then(function () {
      comments = [].slice.call(arguments);
      var result = products.map(function (product, index) {
        var liked = false;
        if (request.user && request.user.id) {
          likes[index].forEach(function (like) {
            if(like.get('likedUser').id === request.user.id) liked = true;
          })
        }
        return {
          product: product,
          comments: comments[index],
          likes: likes[index],
          liked: liked,
          category: 'main'
        }
      })
      response.success(result);
    });
  });
});

Parse.Cloud.define('friendWithRelated', function (request, response) {
  if (request.user) {
    request.user.relation('friendsRelation').query().find().then(function (friends) {
      var productQueries = friends.map(function (friend) {
        var productQuery = new Parse.Query('Products');
        productQuery.equalTo('seller', friend);
        return productQuery.find();
      });
      Parse.Promise.when(productQueries).then(function () {
        var products = [].slice.call(arguments);
        var result = []
        friends.forEach(function (friend, index) {
          if(products[index].length !== 0) {
            result.push({
              friend: friend,
              products: products[index]
            })
          }
        })
        response.success(result);
      })
    });
  } else {
    response.success([]);
  }
});
