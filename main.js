
// Use Parse.Cloud.define to define as many cloud functions as you want.
// For example:

/* nexmo --------------------------- */
var nexmoAPI = require('cloud/lib/nexmoKey');
var categoryConstants = require('cloud/lib/categoryConstants');
var Image = require("parse-image");

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

Parse.Cloud.beforeSave("_User", function(request, response) {
  console.log('beforeSave User');
  var user = request.object;
  console.log('user: ', user);
  if (!user.dirty("avatarImage")) {
    // The profile photo isn't being modified.
    console.log('no modified');
    response.success();
  } else {
    console.log('modified');
    Parse.Cloud.httpRequest({
      url: user.get("avatarImage").url()

    }).then(function(response) {
      var image = new Image();
      return image.setData(response.buffer);

    }).then(function(image) {
      // Crop the image to the smaller of width or height.
      var size = Math.min(image.width(), image.height());
      return image.crop({
        left: (image.width() - size) / 2,
        top: (image.height() - size) / 2,
        width: size,
        height: size
      });

    }).then(function(image) {
      // Resize the image to 64x64.
      return image.scale({
        width: 200,
        height: 200
      });

    }).then(function(image) {
      // Make sure it's a JPEG to save disk space and bandwidth.
      return image.setFormat("PNG");

    }).then(function(image) {
      // Get the image data in a Buffer.
      return image.data();

    }).then(function(buffer) {
      // Save the image into a new file.
      var base64 = buffer.toString("base64");
      var cropped = new Parse.File("thumbnail.png", { base64: base64 });
      return cropped.save();

    }).then(function(cropped) {
      // Attach the image file to the original object.
      user.set("avatarImage", cropped);

    }).then(function(result) {
      response.success();
    }, function(error) {
      response.error(error);
    });
  }
});

Parse.Cloud.afterDelete('Products', function (request) {
  var productId = request.object.id;
  var activitesQuery = new Parse.Query('Activites');
  activitesQuery.equalTo('activityObject', request.object).find().then(function (activites) {
    Parse.Object.destroyAll(activites);
  });
  var messagesQuery = new Parse.Query('Messages');
  messagesQuery.equalTo('product', request.object).find().then(function (messages){
    Parse.Object.destroyAll(messages);
  });
  var commentsQuery = new Parse.Query('Comments');
  commentsQuery.equalTo('product', request.object).find().then(function (comments) {
    Parse.Object.destroyAll(comments);
  });
  var likesQuery = new Parse.Query('Likes');
  likesQuery.equalTo('likedProduct', request.object).find().then(function (likes) {
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

Parse.Cloud.define('findFriendByPhones', function (request, response) {
  var promiseReqs = request.params.phones.map(function (phone) {
    var query = new Parse.Query(Parse.User);
    query.equalTo('mobile', phone);
    return query.first();
  });

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

Parse.Cloud.define('getProductById', function (request, response) {
  var productsQuery = new Parse.Query('Products');
  var commentsQuery = new Parse.Query('Comments');
  var likesQuery = new Parse.Query('Likes');
  var productContainer = {};
  productContainer.liked = false;
  productsQuery.include('seller');
  productsQuery.get(request.params.productId).then(function (product) {
    var commentsPromise = commentsQuery.equalTo('product', product).include('commenter').descending('createdAt').find()
    var likesPromise = likesQuery.equalTo('likedProduct', product).include('likedUser').find()
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
  var user = request.user;
  var productsQuery = new Parse.Query('Products');
  var commentsQuery = new Parse.Query('Comments');
  var likesQuery = new Parse.Query('Likes');
  productsQuery.equalTo('seller', user);
  productsQuery.find().then(function (products) {
    response.success(products);
  })
});

Parse.Cloud.define('getLikedProductsByUser', function (request, response) {
  var user = request.user;
  var likesQuery = new Parse.Query('Likes');
  likesQuery.equalTo('likedUser', user);
  likesQuery.include('likedProduct').find().then(function (likes) {
    console.log('likes: ', likes);
    var likedProducts = likes.map(function (like) {
      return like.get('likedProduct');
    });
    response.success(likedProducts);
  })
});

Parse.Cloud.define('unlikeProducts', function (request, response) {
  console.log('unlikeProducts: ' + request.params.unlikedProductId);
  var unlikedProductId = request.params.unlikedProductId || 0;
  var user = request.user;
  var likesQuery = new Parse.Query('Likes');
  var productsQuery = new Parse.Query('Products');
  productsQuery.get(request.params.unlikedProductId).then(function (product) {
    likesQuery
      .equalTo('likedUser', user)
      .equalTo('likedProduct', product)
      .find().then(function (likes) {
        console.log('likes: ', likes);
        Parse.Object.destroyAll(likes);
        response.success('unlikeProducts OK');
    });
  })
});


Parse.Cloud.define('productWithRelated', function (request, response) {
  var skip = request.params.skip || 0;
  var limit = request.params.limit || 10;
  var selectedCategory = request.params.selectedCategory;
  console.log('selectedCategory: ' + selectedCategory);
  var productsQuery = new Parse.Query('Products');

  productsQuery
    .limit(limit)
    .skip(skip)
    .include('seller')
    .descending('createdAt');
  if (typeof selectedCategory !== "undefined" && selectedCategory !== categoryConstants.ALL_PRODUCT) {
    productsQuery.equalTo('category', selectedCategory);
  }
  productsQuery.find().then(function (products) {
    var likes = null;
    var comments = null;
    var likeQueries = products.map(function (product) {
      var likesQuery = new Parse.Query('Likes');
      likesQuery
        .equalTo('likedProduct', product)
        .include('likedUser');
      return likesQuery.find();
    })

    var commentQueries = products.map(function (product) {
      var commentsQuery = new Parse.Query('Comments');
      commentsQuery
        .equalTo('product', product)
        .include('commenter')
        .descending('createdAt');
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
            if((like.get('likedUser') && like.get('likedUser').id) === request.user.id) liked = true;
          })
        }
        return {
          product: product,
          comments: comments[index],
          likes: likes[index],
          liked: liked,
          category: selectedCategory || 'main'
        }
      })
      response.success(result);
    });
  });
});

Parse.Cloud.define('friendWithRelated', function (request, response) {
  if (request.user) {
    var allFriends = [];
    var allFriendsProducts = [];
    var tmpFriendsFriends = [];
    var allFriendsFriends = [];
    var allFriendsFriendsProduct = [];
    request.user.relation('friendsRelation').query().find().then(function (friends) {
      var productQueries = friends.map(function (friend) {
        var productQuery = new Parse.Query('Products');
        productQuery.equalTo('seller', friend);
        return productQuery.find();
      });
      Parse.Promise.when(productQueries).then(function () {
        var friendProducts = [].slice.call(arguments);
        friends.forEach(function (friend, index) {
          if(friendProducts[index].length !== 0) {
            allFriends.push(friend);
            allFriendsProducts.push(friendProducts[index]);
          }
        })
        var friendsFriendQueryPromise = friends.map(function (friend) {
          var friendRelationQuery = friend.relation('friendsRelation').query();
          return friendRelationQuery.find();
        });
        return Parse.Promise.when(friendsFriendQueryPromise)
      }).then(function () {
          var friendsFriendsList = [].slice.call(arguments);
          var friendsProductsQueryPromise = [];
          friendsFriendsList.forEach(function (friendsFriends) {
            friendsFriends.forEach(function (friendsFriend) {
              tmpFriendsFriends.push(friendsFriend);
              var productQuery = new Parse.Query('Products');
              productQuery.equalTo('seller', friendsFriend);
              friendsProductsQueryPromise.push(productQuery.find());
            })
          })
          return Parse.Promise.when(friendsProductsQueryPromise);
      }).then(function () {
        var friendsFriendProducts = [].slice.call(arguments);
        tmpFriendsFriends.forEach(function (tmpFriendsFriend, index) {
          if(friendsFriendProducts[index].length !== 0) {
            allFriendsFriends.push(tmpFriendsFriend);
            allFriendsFriendsProduct.push(friendsFriendProducts[index]);
          }
        })
        response.success({
          allFriends: allFriends,
          friendsProducts: allFriendsProducts,
          allFriendsFriends: allFriendsFriends,
          allFriendsFriendsProduct: allFriendsFriendsProduct
        });
      })
    });
  } else {
    response.success([]);
  }
});
