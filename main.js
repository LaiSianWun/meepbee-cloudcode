
// Use Parse.Cloud.define to define as many cloud functions as you want.
// For example:

/* nexmo --------------------------- */
var nexmoAPI = require('cloud/lib/nexmoKey');
var pushd = require('cloud/lib/pushd');
var categoryConstants = require('cloud/lib/categoryConstants');
var Image = require("parse-image");
var _ = require('underscore');
var Buffer = require('buffer').Buffer;

/**
 *   Create a Parse ACL which prohibits public access.  This will be used
 *   in several places throughout the application, to explicitly protect
 *   Parse User, TokenRequest, and TokenStorage objects.
 */
var restrictedAcl = new Parse.ACL();
restrictedAcl.setPublicReadAccess(false);
restrictedAcl.setPublicWriteAccess(false);

var TokenStorage = Parse.Object.extend("TokenStorage");

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
  if (!user.dirty("avatarImage") && !user.dirty("thirdPartyProfileImage")) {
    // The profile photo isn't being modified.
    console.log('no modified');
    response.success();
  } else {
    console.log('modified');
    var profileImageUrl = ''
    if (user.dirty("thirdPartyProfileImage")) {
      console.log('thirdPartyProfileImage is dirty');
      profileImageUrl = user.get("thirdPartyProfileImage");
    } else {
      console.log('avatarImage is dirty');
      profileImageUrl = user.get("avatarImage").url();
    }
    Parse.Cloud.httpRequest({
      url: profileImageUrl
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

Parse.Cloud.afterSave("Chats", function(request, response) {
  console.log('afterSaves Chats');
  var sender = request.user;
  var chat = request.object;
  var chatRoomId = chat.get('chatRoomId');
  var text = chat.get('text');
  var buyerId = chatRoomId.substring(0, 10);
  var sellerId = chatRoomId.substring(20, 30);
  if (sender.id !== buyerId) {
    console.log('should send push to buyer');
    sendPushToChannel({'title': 'beeding', 'msg': sender.get('name') + '：' + text}, "beeding-"+buyerId)
  } else {
    console.log('should send push to seller');
    sendPushToChannel({'title': 'beeding', 'msg': sender.get('name') + '：' + text}, "beeding-"+sellerId)
  }
});

Parse.Cloud.afterSave("Follows", function(request, response) {
  console.log('afterSave Follows');
  var sender = request.user;
  var follow = request.object;
  var toUser = follow.get('toUser');
  console.log('toUser: ' + toUser.id);
  var text = '在beeding上開始追蹤您。'
  sendPushToChannel({'title': 'beeding', 'msg': sender.get('name') + text}, "beeding-"+toUser.id)
});

Parse.Cloud.afterSave("Likes", function(request, response) {
  console.log('afterSaves Likes');
  var sender = request.user;
  var like = request.object;
  var likedProduct = like.get('likedProduct');
  var productsQuery = new Parse.Query('Products');
  productsQuery.get(likedProduct.id).then(function (product) {
    var text = sender.get('name') + "喜歡您的商品" + product.get('title') + "。"
    sendPushToChannel({'title': 'beeding', 'msg': text}, "beeding-"+product.get('seller').id)
  });
});

Parse.Cloud.afterSave("Comments", function(request, response) {
  console.log('afterSaves Comments');
  var sender = request.user;
  var comment = request.object;
  var commentedProduct = comment.get('product');
  var productsQuery = new Parse.Query('Products');
  productsQuery.get(commentedProduct.id).then(function (product) {
    var sellerId = product.get('seller').id;
    if (sender.id !== sellerId) {
      var text = sender.get('name') + "在您的商品" + product.get('title') + "上留言。"
      sendPushToChannel({'title': 'beeding', 'msg': text}, "beeding-"+sellerId)
    } else {
      var text = sender.get('name') + "回覆您在商品\"" + product.get('title') + "\"上的留言。"
      sendPushToChannel({'title': 'beeding', 'msg': text}, "beeding-comment-"+product.id)
    }
  });
});

var orderStatus = {
  'ORDER_STATUS_UNREAD': '尚未處理',
  'ORDER_STATUS_READ': '賣家已讀',
  'ORDER_STATUS_PROCESS': '處理中',
  'ORDER_STATUS_MET': '已面交',
  'ORDER_STATUS_SENT': '已寄送',
  'ORDER_STATUS_CANCEL': '訂單取消',
  'ORDER_STATUS_DELETE': '刪除訂單',
}

Parse.Cloud.afterSave("Orders", function(request, response) {
  console.log('afterSaves Orders');
  var sender = request.user;
  var order = request.object;
  if (order.get('orderStatus') === 'ORDER_STATUS_UNREAD') {
    var text = sender.get('name') + "購買你的商品\"" + order.get('orderForm').title + "\"，趕緊處理訂單吧！"
    sendPushToChannel({'title': 'beeding', 'msg': text}, "beeding-"+order.get('seller').id)
  } else {
    var text = "訂單\"" + order.get('orderForm').title + "\"，狀態已改變為\"" + orderStatus[order.get('orderStatus')] + "\"。"
    console.log('text: ' + text);
    sendPushToChannel({'title': 'beeding', 'msg': text}, "beeding-"+order.get('buyer').id)
  }
});

Parse.Cloud.afterDelete('Orders', function (request) {
  console.log('afterDelete Orders');
  var sender = request.user;
  var order = request.object;
  var text = "訂單\"" + order.get('orderForm').title + "\"，已被刪除。"
  console.log('text: ' + text);
  sendPushToChannel({'title': 'beeding', 'msg': text}, "beeding-"+order.get('buyer').id)

  // Delete ralative classes in case there're some null class pointers.
  var activitesQuery = new Parse.Query('Activites');
  activitesQuery.equalTo('orderObject', request.object).find().then(function (activites) {
    Parse.Object.destroyAll(activites);
  });
  var messagesQuery = new Parse.Query('OrderMessages');
  messagesQuery.equalTo('order', request.object).find().then(function (messages){
    Parse.Object.destroyAll(messages);
  });
});

Parse.Cloud.afterSave("Products", function(request, response) {
  console.log('afterSaves Products');
  var sender = request.user;
  var product = request.object;
  if (product.updatedAt.getTime() == product.createdAt.getTime()) {
    // Count how many products a seller has now
    var productsQuery = new Parse.Query('Products');
    productsQuery.equalTo('seller', sender).count().then(function (count) {
      sender.set('numberOfProducts', count);
      sender.save();
    })
    return findReceiverIds(sender).then(function (receiverIds) {
      var uniqReceiverIds =  _.uniq(receiverIds);
      uniqReceiverIds.forEach(function (receiverId) {
        var text =  sender.get('name') + "在beeding上賣了\"" + product.get('title') + "\"，趕緊過來看看！～"
        sendPushToChannel({'title': 'beeding', 'msg': text}, "beeding-"+receiverId);
      })
    }, function (error) {
      console.log('findReceiverIds error');
      console.log(error);
    });
  }
});

var findReceiverIds = function (sender) {
  return sender.relation('friendsRelation').query().find().then(function (friends) {
    var receiverIds = friends.map(function (friend) {
      return friend.id;
    })
    var followsQuery = new Parse.Query('Follows');
    return followsQuery.equalTo('toUser', sender).find().then(function (follows) {
        follows.forEach(function (follow) {
          var receiverId = follow.get('from').id;
          receiverIds.push(receiverId);
        })
        var friendsFriendQueryPromise = friends.map(function (friend) {
          var friendRelationQuery = friend.relation('friendsRelation').query();
          return friendRelationQuery.find();
        });
        return Parse.Promise.when(friendsFriendQueryPromise).then(function () {
          var friendsFriendsList = [].slice.call(arguments);
          friendsFriendsList.forEach(function (friendsFriends) {
            friendsFriends.forEach(function (friendsFriend) {
              receiverIds.push(friendsFriend.id);
            })
          })
          return Parse.Promise.as(receiverIds);
        }, function (error) {
          return Parse.Promise.error(error)
        })
      }, function (error) {
        return Parse.Promise.error(error)
      });
  });
};

Parse.Cloud.afterSave("InproperPrudct" , function (request, response) {
  console.log('afterSaves InproperPrudct');
  var sender = request.user;
  var inproperPrudct = request.object;
  var productQuery = new Parse.Query('Products');
  productQuery.get(inproperPrudct.get('product').id).then(function (fetchedProduct) {
    fetchedProduct.set('inproper', true);
    fetchedProduct.set('inproperDetail', inproperPrudct);
    fetchedProduct.save().then(function () {
      var text =  "您的商品\"" + fetchedProduct.get('title') + "\"已被檢舉，原因為：\"" + inproperPrudct.get('reason') + "\"，如為錯誤的檢舉，確認後會再次幫您自動上架。"
      sendPushToChannel({'title': 'beeding', 'msg': text}, "beeding-"+fetchedProduct.get('seller').id);
    })
  });
});

var sendPushToChannel = function (data, channel) {
  Parse.Cloud.httpRequest({
    url: pushd.domain+"/event/"+channel,
    method: "POST",
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'accept': 'application/json'
    },
    body: data,
    success: function (httpResponse) {
      console.log(httpResponse);
    },
    error: function (httpResponse) {
      console.log(httpResponse);
    }
  });
};

Parse.Cloud.beforeSave("Products", function(request, response) {
  if (request.object.id) {
    var hashtagsQuery = new Parse.Query('Hashtags');
    hashtagsQuery.equalTo("product", request.object).find().then(function (hashtags) {
        Parse.Object.destroyAll(hashtags).then(function () {
          response.success();
        });
      });
  } else {
    response.success();
  }
});

Parse.Cloud.afterDelete('Products', function (request) {
  var productId = request.object.id;

  // Count how many products a seller has now
  if (request.user) {
    var sender = request.user;
    var productsQuery = new Parse.Query('Products');
    productsQuery.equalTo('seller', sender).count().then(function (count) {
      sender.set('numberOfProducts', count);
      sender.save();
    })
  }

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
  var hashtagsQuery = new Parse.Query('Hashtags');
  hashtagsQuery.equalTo("product", request.object).find().then(function (hashtags) {
      Parse.Object.destroyAll(hashtags);
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
  if (video) {
    Parse.Cloud.httpRequest({
      method: 'DELETE',
      url: video.url(),
      headers: {
        "X-Parse-Application-Id": "DHPbawPXsk9VM697XtD0UNuYAuaxuxc8tEXoIquY",
        "X-Parse-Master-Key": "gHSj9XICI4DxlHD89WCzWn1ki77foPucPBAqil6p"
      }
    });
  }
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

Parse.Cloud.afterDelete('OrderMessages', function (request) {
  var chatsQuery = new Parse.Query('Chats');
  chatsQuery.equalTo('chatRoomId', request.object.chatRoomId).find().then(function (chats) {
    Parse.Object.destroyAll(chats);
  })
});

Parse.Cloud.define('createHashtags', function (request, response) {
  var hashtags = request.params.hashtags;
  var productId = request.params.productId;
  console.log("hashtags: " + hashtags + "productId: " + productId);
  var Hashtags = Parse.Object.extend("Hashtags");
  var productsQuery = new Parse.Query('Products');
  productsQuery.get(productId).then(function (product) {
    var promiseReqs = hashtags.map(function (hashtag) {
      var ht = new Hashtags();
      ht.set('hashtag', hashtag);
      ht.set('product', product);
      return ht.save();
    });
    Parse.Promise.when(promiseReqs).then(function () {
      response.success('ok');
    }, function (error) {
      response.error('error');
    });
  }, function (error) {
    response.error('error');
  });
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
    if (users.length > 0) {
      request.user.relation('friendsRelation').add(users);
      request.user.save().then(function () {
        response.success('ok');
      });
    } else {
      response.success('no friends');
    }
  });
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

Parse.Cloud.define('getProductById', function (request, response) {
  var productsQuery = new Parse.Query('Products');
  var commentsQuery = new Parse.Query('Comments');
  var likesQuery = new Parse.Query('Likes');
  var productContainer = {};
  productContainer.liked = false;
  productsQuery.include('seller');
  productsQuery.get(request.params.productId).then(function (product) {
    var commentsPromise = commentsQuery.equalTo('product', product).include('commenter').descending('createdAt').find();
    var likesPromise = likesQuery.equalTo('likedProduct', product).include('likedUser').find();
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

Parse.Cloud.define('getProductContainersByUser', function (request, response) {
  var user = request.user;
  var filerFlag = request.params.filerFlag
  var productsQuery = new Parse.Query('Products');
  if (filerFlag == true) {
    productsQuery.notEqualTo('inproper', true);
  }
  productsQuery
    .include('seller').equalTo('seller', user).find().then(function (products) {
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
      var results = products.map(function (product, index) {
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
          liked: liked
        }
      })
      response.success(results);
    });
  });
});

Parse.Cloud.define('getSellersOtherProductContainers', function (request, response) {
  var productId = request.params.productId;
  var singleProductQuery = new Parse.Query('Products');
  singleProductQuery.get(productId).then(function (aProduct) {
    var productsQuery = new Parse.Query('Products');
    productsQuery
      .include('seller')
      .equalTo('seller', aProduct.get('seller'))
      .notEqualTo('inproper', true).notEqualTo('objectId', aProduct.id).find().then(function (products) {
        var likes = null;
        var comments = null;
        var likeQueries = products.map(function (product) {
          var likesQuery = new Parse.Query('Likes');
          likesQuery.equalTo('likedProduct', product).include('likedUser');
          return likesQuery.find();
        });
        var commentQueries = products.map(function (product) {
          var commentsQuery = new Parse.Query('Comments');
          commentsQuery.equalTo('product', product).include('commenter').descending('createdAt');
          return commentsQuery.find();
        });
        Parse.Promise.when(likeQueries).then(function () {
          likes = [].slice.call(arguments);
          return Parse.Promise.when(commentQueries);
        }).then(function () {
          comments = [].slice.call(arguments);
          var results = products.map(function (product, index) {
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
              liked: liked
            }
          });
          response.success(results);
        });
      });
  });
});

Parse.Cloud.define('getProductsByTag', function (request, response) {
  var tag = request.params.tag;
  // get tags by equalTo tag
  var hashtagsQuery = new Parse.Query('Hashtags');
  hashtagsQuery.equalTo('hashtag', tag).find().then(function (hashtagObjs) {
      var commentsQuery = new Parse.Query('Comments');
      var likesQuery = new Parse.Query('Likes');
      var productContainerQueries = hashtagObjs.map(function (hashtagObj) {
        var productContainer = {};
        productContainer.liked = false;
        productContainer.tag = tag;
        var productsQuery = new Parse.Query('Products');
        return productsQuery.include('seller').get(hashtagObj.get('product').id).then(function (product) {
            var commentsPromise = commentsQuery.equalTo('product', product).include('commenter').descending('createdAt').find();
            var likesPromise = likesQuery.equalTo('likedProduct', product).include('likedUser').find();
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
          return productContainer;
        })
      })
      Parse.Promise.when(productContainerQueries).then(function () {
        var productContainers = [].slice.call(arguments);
        response.success(productContainers);
      })
  }, function (error) {
    response.error(error);
  })
});

Parse.Cloud.define('productWithRelated', function (request, response) {
  var skip = request.params.skip || 0;
  var limit = request.params.limit || 24;
  var selectedCategory = request.params.selectedCategory;
  console.log('selectedCategory: ' + selectedCategory);
  var productsQuery = new Parse.Query('Products');

  productsQuery
    .limit(limit)
    .skip(skip)
    .include('seller')
    .descending('createdAt')
    .notEqualTo('inproper', true);
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
      var results = products.map(function (product, index) {
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
      response.success(results);
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
        if (friends.length > 0) {
          var friendProducts = [].slice.call(arguments);
          friends.forEach(function (friend, index) {
            console.log("friendProducts[index].length: " + friendProducts[index].length);
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
        } else {
          response.success({
            allFriends: [],
            friendsProducts: [],
            allFriendsFriends: [],
            allFriendsFriendsProduct: [],
          });
        }
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
          allFriendsFriendsProduct: allFriendsFriendsProduct,
        });
      })
    });
  } else {
    response.success({
      allFriends: [],
      friendsProducts: [],
      allFriendsFriends: [],
      allFriendsFriendsProduct: [],
    });
  }
});

Parse.Cloud.define('thirdPartyLogin', function (request, response) {
  console.log('thirdPartyLogin');
  Parse.Cloud.useMasterKey();
  var accessToken = request.params.thirdPartyUserData.token;
  var thirdPartyUserData = request.params.thirdPartyUserData;
  return upsertGitHubUser(accessToken, thirdPartyUserData).then(function (user) {
    console.log('is generated');
    response.success(user.getSessionToken());
  }, function (error) {
    console.log(error);
    response.error(error);
  });
});

/**
 *   This function checks to see if this GitHub user has logged in before.
 *   If the user is found, update the accessToken (if necessary) and return
 *   the users session token.  If not found, return the newGitHubUser promise.
 */
var upsertGitHubUser = function(accessToken, thirdPartyUserData) {
  console.log('upsertGitHubUser');
  var query = new Parse.Query(TokenStorage);
  query.equalTo('thirdPartyId', thirdPartyUserData.userID);
  query.ascending('createdAt');
  var password;
  // Check if this thirdPartyId has previously logged in, using the master key
  return query.first({ useMasterKey: true }).then(function(tokenData) {
    // If not, create a new user.
    if (!tokenData) {
      console.log('!tokenData');
      return newGitHubUser(accessToken, thirdPartyUserData);
    }
    // If found, fetch the user.
    var user = tokenData.get('user');
    return user.fetch({ useMasterKey: true }).then(function(user) {
      // Update the accessToken if it is different.
      if (accessToken !== tokenData.get('accessToken')) {
        console.log('Update the accessToken if it is different');
        tokenData.set('accessToken', accessToken);
      }
      /**
       * This save will not use an API request if the token was not changed.
       * e.g. when a new user is created and upsert is called again.
       */
      return tokenData.save(null, { useMasterKey: true });
    }).then(function(obj) {
  		password = new Buffer(24);
  		_.times(24, function(i) {
  			password.set(i, _.random(0, 255));
  		});
  		password = password.toString('base64')
  		user.setPassword(password);
      console.log('user.save()');
      return user.save();
    }).then(function(user) {
      console.log('Parse.User.logIn');
  		return Parse.User.logIn(user.get('username'), password);
    }).then(function(user) {
      // Return the user object.
      console.log('Parse.Promise.as(user)');
      return Parse.Promise.as(user);
    });
  });
};

/**
 *  This function creates a Parse User with a random login and password, and
 *  associates it with an object in the TokenStorage class.
 *  Once completed, this will return upsertGitHubUser.  This is done to protect
 *  against a race condition:  In the rare event where 2 new users are created
 *  at the same time, only the first one will actually get used.
 */
var newGitHubUser = function(accessToken, thirdPartyUserData) {
  console.log('newGitHubUser');
  var user = new Parse.User();
  // Generate a random username and password.
  var username = new Buffer(24);
  var password = new Buffer(24);
  _.times(24, function(i) {
    username.set(i, _.random(0, 255));
    password.set(i, _.random(0, 255));
  });
  user.set("username", username.toString('base64'));
  user.set("password", password.toString('base64'));
  user.set('name', thirdPartyUserData.name);
  user.set('fbEmail', thirdPartyUserData.email);
  user.set('facebookId', thirdPartyUserData.userID);
  user.set('thirdPartyLogin', true);
  user.set('thirdPartyProfileImage', thirdPartyUserData.profileImageUrl);
  user.set('shippings', [{'fee': 0, 'selected': false, 'shippingWay': '面交'}, {'fee': 0, 'selected': false, 'shippingWay': '郵寄'}, {'fee': 0, 'selected': false, 'shippingWay': '貨到付款'}]);
  user.set('payments', [{'description': '', 'selected': false, 'tradingWay': '面交'}, {'description': '', 'selected': false, 'tradingWay': 'ATM轉帳'}, {'description': '', 'selected': false, 'tradingWay': '貨到付款'}]);
  user.set('numberOfProducts', 0);
  // Sign up the new User
  return user.signUp().then(function(user) {
    console.log('user.signUp().then');
    // create a new TokenStorage object to store the user+GitHub association.
    var ts = new TokenStorage();
    ts.set('thirdPartyId', thirdPartyUserData.userID);
    // ts.set('thirdPartyLogin', thirdPartyUserData.login);
    ts.set('accessToken', accessToken);
    ts.set('user', user);
    ts.setACL(restrictedAcl);
    // Use the master key because TokenStorage objects should be protected.
    return ts.save(null, { useMasterKey: true });
  }, function (error) {
    console.log('user.signUp().then error');
    return Parse.Promise.error(error)
  }).then(function(tokenStorage) {
    return upsertGitHubUser(accessToken, thirdPartyUserData);
  });
};
