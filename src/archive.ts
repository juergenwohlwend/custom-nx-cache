import path from 'path';
import stream from 'stream';
import tar from 'tar';

export async function archiveFromDir(
  cacheDirectory: string,
  hash: string
): Promise<Buffer> {
  return new Promise(async function (resolve, reject) {
    const archive = tar.create({ gzip: false, cwd: cacheDirectory }, [
      path.join(cacheDirectory, hash),
    ]);

    var buffer: Uint8Array[] = [];
    archive.on('data', function (data) {
      buffer.push(data);
    });
    archive.on('end', function () {
      resolve(Buffer.concat(buffer));
    });
  });
}

export async function unarchiveIntoDir(
  archive: Buffer,
  cacheDirectory: string
): Promise<void> {
  return new Promise(async function (resolve, reject) {
    let archiveStream: stream.PassThrough = new stream.PassThrough();

    archiveStream.end(archive);

    const rootToCwd = path.relative(process.cwd(), '/');
    const stripConuter = rootToCwd.split(path.sep).length;

    let extract = tar.extract({ cwd: './', strip: stripConuter });

    extract.on('error', reject);
    extract.on('close', resolve);

    archiveStream.pipe(extract).on('entry', () => {});
  });
}
