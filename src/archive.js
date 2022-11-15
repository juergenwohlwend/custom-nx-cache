"use strict";

const fs = require('fs');
const util = require('util');
const path = require('path');
const stream = require('stream');

const archiver = require('archiver');
const tar = require('tar');


/**
 * Archive multiple files, directories, buffers, streams and strings; supports 'zip' and 'tar' formats
 *
 * @param {Object[]} entries - Array of entries to archive; An entry can be an Object or a path String
 *   @param {(String|Buffer|Stream)} entries[].data - The data you wish to archive: file/directory path (String), Buffer, Stream or String (to save as a file)
 *
 *   @param {String} [entries[].type] - Entry types: 'file', 'directory', 'other'; The type can be automatically determined so it's optional (but if you know it, use it);
 *   Buffer, Stream and String are handled automatically and are classified here as 'other'; you can use any name instead of 'other' since it's the default
 *
 *   @param {String} [entries[].name] - The name the entry will have in the archive; may be a path within the archive (e.g. '/path/name');
 *   Optional for 'file' and 'directory' (basenames are used by default), recommended for 'other' (a counter will be used if missing, starts at 101)
 *
 * @param {Object} [options] - Options
 *   @param {String} [options.format=zip] - Archive format: 'tar', 'zip'; default: 'zip'
 *
 *   @param {String} [options.output=buffer] - Output type: 'buffer', 'stream', '/path'; default: 'buffer';
 *   If you enter a path string, the archive will be saved there, resolve value will be the path string
 *
 * @returns {Promise} A Promise that returns the archive (Buffer by default); If entries is null/undefined, then the promise will return null
 *
 * @example
 *
 * archive(path); // Can take any value of one of the types mentioned above, but only path strings will keep their names
 *
 * archive(['/path/file.txt', '/path/auto-detect-dir-or-file-type', '/and-so-on']) // same
 *
 * archive([
 *  { data: '/path/file', type: 'file',      name: 'optional-new-name'  },
 *  { data: '/path/dir',  type: 'directory', name: 'optional-new-name'  },
 *  { data: buffer,       type: 'buffer',    name: 'should-have-a-name' },
 *  { data: stream,       type: 'stream',    name: 'should-have-a-name' },
 *  { data: 'string',     type: 'string',    name: 'should-have-a-name' }
 * ], {
   *      format: 'tar',
   *      output: '/path'
   * }); // we're making it a 'tar' archive and saving it to a path
 *
 * You can mix Objects and Strings inside the entries Array
 */
function archive (entries, options)
{
    return new Promise(async function (resolve, reject) {
        if (!entries) return resolve(null);
        if (!util.isArray(entries)) entries = [entries];
        if (!options) options = {};

        let data = [];
        let archive = archiver(options.format || 'zip');

        archive.on('error', reject);
        // If buffer (default) output
        if (!options.output || options.output === 'buffer') {
            archive.on('data', part => data.push(part));

            archive.on('end', () => {
                resolve(Buffer.concat(data));
            });
        }

        let counter = 0; // counter, in case of 'other' without a name
        for (let entry of entries) {
            if (!entry.data) {
                entry = { data: entry };
            }

            let type = entry.type || 'other';
            if (!entry.type && util.isString(entry.data)) {
                type = await new Promise(resolve => fs.stat(entry.data, (err, stats) => resolve(err ? type : (stats.isDirectory() ? 'directory' : 'file'))));
            }

            switch (type) {
                case 'file':
                    archive.file(entry.data, { name: entry.name || path.basename(entry.data) });
                    break;
                case 'directory':
                    archive.directory(entry.data, entry.name || path.basename(entry.data));
                    break;
                default:
                    archive.append(entry.data, { name: entry.name || `${counter++}` });
            }
        }

        if (options.output === 'stream') {
            resolve(archive);
        } else if (options.output && options.output !== 'buffer') { // If path output
            let output = fs.createWriteStream(options.output);
            archive.pipe(output);
            output.on('close', () => resolve(options.output));
        }

        archive.finalize();
    });
}

/**
 * Extract an archive to a given path
 *
 * @param {(String|Buffer|Stream)} archive - The archive path (String) or Buffer or Stream
 * @param {String} destination - The location to extract the archive contents to
 * @param {Object} [options] - Options
 *   @param {String} [options.format=zip] - Archive format: 'zip', 'tar'; defaults to 'zip'
 *
 * @returns {Promise} - Extraction is over when the promise resolves
 */
function extract (archive, destination, options)
{
    return new Promise((resolve, reject) => {
        if (!archive) return resolve(null);
        if (!options) options = {};

        let archiveStream = archive;
        if (util.isString(archive)) {
            archiveStream = fs.createReadStream(archive);
            archiveStream.on('error', reject);
        } else if (util.isBuffer(archive)) {
            archiveStream = new stream.PassThrough();
            archiveStream.end(archive);
        }

        let extract = tar.x({ cwd: destination });


        extract.on('error', reject);
        extract.on('close', resolve);

        archiveStream.pipe(extract);
    })
}

module.exports = {
    archive: archive,
    extract: extract,
    archiver: archiver,
    tar: tar
};