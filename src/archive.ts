import { clone, isFunction } from "lodash";
import { RemoteCache } from "@nx/devkit";
import fs from "fs";
import levelUp, { LevelUp } from "levelup";
import path from "path";
import tar from "tar";
import util from "util";
import stream from "stream";

export async function archiveFromDir(
  cacheDirectory: string,
  hash: string
): Promise<Buffer> {
  return new Promise(async function (resolve, reject) {
    const archive = tar.create({ gzip: false, cwd: cacheDirectory }, [
      path.join(cacheDirectory, hash),
    ]);

    var buffer = [];
    archive.on("data", function (data) {
      buffer.push(data);
    });
    archive.on("end", function () {
      resolve(Buffer.concat(buffer));
    });
  });
}

export async function unarchiveIntoDir(
  archive: Buffer,
  cacheDirectory: string
): Promise<void> {
  return new Promise(async function (resolve, reject) {
    let archiveStream: stream.PassThrough;
    /*if (typeof archive === "string") {
      archiveStream = fs.createReadStream(archive);
      archiveStream.on("error", reject);
    } else if (Buffer.isBuffer(archive)) {*/
    archiveStream = new stream.PassThrough();
    archiveStream.end(archive);
    //}

    const relative = path.relative(process.cwd(), cacheDirectory);

    const rootToCwd = path.relative(process.cwd(), "/");
    const stripConuter = rootToCwd.split(path.sep).length;

    let extract = tar.extract({ cwd: "./", strip: stripConuter });

    extract.on("error", reject);
    extract.on("close", resolve);

    archiveStream.pipe(extract).on("entry", (entry) => {
      //entry.path = path.join(entry.path, rootToCwd);
      //console.log(entry.path);
    });
  });
}
