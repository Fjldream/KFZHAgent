const { resource } = require("../../../controllers");
module.exports = {
  get: {
    "/readFile": resource.readFile,
    "/isFile": resource.isFile,
    "/download": resource.download,
    "/filesList": resource.filesList,
    "/getFile": resource.getFile,
    "/uploads": resource.uploads,
    "/readFileInUniverData": resource.readFileInUniverData,
    "/readFileImgData": resource.readFileImgData,
  },
  post: {
    "/writeFile": resource.writeFile,
    "/upload": resource.upload,
    "/uploadReportFile": resource.uploadReportFile,
    "/delete": resource.deleteFile,
    "/creatFolder": resource.creatFolder,
    "/deleteFolder": resource.deleteFolder,
    "/searchFile": resource.searchFile,
    "/copyFile": resource.copyFile,
    "/renameFile": resource.renameFile,
    "/saveImgWithBase64ToUpload": resource.saveImgWithBase64ToUpload,
    "/saveHtModel": resource.saveHtModel,
  },
};
