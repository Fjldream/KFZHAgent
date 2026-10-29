const {
  user
} = require("../../../controllers");
module.exports = {
  get: {
    "/getServerTime": (o, e, r) => {
      e.send(Date.now().toString())
    },
    "/refreshToken": user.refreshToken,
    "/getpublickeystring": user.getPublicKey,
    "/api/v1/getUserInfo": user.getUserInfo,
    "/login": user.login,
    "/singleLogin": user.singleLogin,
    "/ssoLogin": user.ssoLogin,
    "/thirdTokenLogin": user.thirdTokenLogin,
    "/SsoGetUserInfo": user.SsoGetUserInfo,
    "/checkThirdToken": user.checkThirdToken,
    "/getServerInfo": user.getServerInfo,
    "/api/v1/logoff": user.logoff,
    "/api/v1/userList": user.getUserList,
    "/api/v1/groupList": user.getGroupList,
    "/getLoginHistory": user.getLoginHistory,
    "/getAllLoginHistory": user.getAllLoginHistory,
    "/api/v1/organizationTree": user.organizationTree,
    "/api/v1/getClientNumOnline": user.getClientNumOnline,
    "/api/v1/roleList": user.getRoleList
  },
  post: {
    "/checkSoftLock": user.checkSoftLock,
    "/multiLoginStatus": user.multiLoginStatus,
    "/api/v1/multiChoice": user.multiChoice,
    "/api/v1/createUser": user.createUser,
    "/userPassword": user.changePassword,
    "/api/v1/resetPassword": user.resetPassword,
    "/createGroup": user.createGroup,
    "/expireChangePassWord": user.expireChangePassWord,
    "/api/v1/editUserPassWordValid": user.editUserPassWordValid,
    // modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
    "/paiTokenLogin": user.paiTokenLogin
    // end
  },
  put: {
    "/api/v1/updateUser": user.changeUser,
    "/updateGroup": user.changeGroup
  },
  delete: {
    "/api/v1/deleteUser": user.deleteUser,
    "/deleteGroup": user.deleteGroup
  }
};
