import { archive, extract } from "./archive";
import { clone, isFunction } from "lodash";
import { RemoteCache } from "@nrwl/workspace/src/tasks-runner/tasks-runner-v2";
import fs from "fs";
import levelUp, { LevelUp } from "levelup";
import path from "path";

export interface ILevelCacheOptions {
  driver?: string;
  name?: string;
  time_to_live?: number;
  debug?: boolean;
}

const cacheOptionsEnvKeyPrefix = "level_task_runner_";
const cacheOptionsEnvKeyDriver = "driver";
const cacheOptionsEnvKeyName = "name";
const cacheOptionsEnvKeyTimeToLive = "time_to_live";
const cacheOptionsDebug = "debug";

export class LevelCache implements RemoteCache {
  private options: ILevelCacheOptions;
  private driverOptions: any;

  constructor(options?: ILevelCacheOptions) {
    this.driverOptions = this.getDriverOptions(options || {});

    this.options = {
      [cacheOptionsEnvKeyDriver]: this.driverOptions[cacheOptionsEnvKeyDriver],
      [cacheOptionsEnvKeyName]: this.driverOptions[cacheOptionsEnvKeyName],
      [cacheOptionsEnvKeyTimeToLive]: this.driverOptions[cacheOptionsEnvKeyTimeToLive],
      [cacheOptionsDebug]: this.driverOptions[cacheOptionsDebug],
    };

    delete this.driverOptions[cacheOptionsEnvKeyDriver];
    delete this.driverOptions[cacheOptionsEnvKeyName];
    delete this.driverOptions[cacheOptionsEnvKeyTimeToLive];
    delete this.driverOptions[cacheOptionsDebug];
  }

  async retrieve(hash: string, cacheDirectory: string): Promise<boolean> {
    const dbAndLevelDownInstance = this.getDb();
    if (!dbAndLevelDownInstance) {
      return false;
    }

    const { db } = dbAndLevelDownInstance;

    return new Promise((resolve, reject) => {
      try {
        debug(this.options.debug, LogType.log,"cache-task-runner: Retrieving cache for ", hash);
        db.get(hash, async (err, value) => {
          if (err) {
            debug(this.options.debug, LogType.error,"cache-task-runner: Error while retrieving cache item ", err);
            resolve(false);
          } else {
            try {
              debug(this.options.debug, LogType.log,"cache-task-runner: stored value", value, cacheDirectory)

              await this.unarchiveIntoDir(value, cacheDirectory);
              fs.writeFileSync(path.join(cacheDirectory, `${hash}.commit`), "true");
              
           
              debug(this.options.debug, LogType.log,"cache-task-runner: Retrieved cache for ", hash);
              resolve(true);
            } catch (e) {
              debug(this.options.debug, LogType.error,"cache-task-runner: Error while retrieving cache item ", e);
              resolve(false);
            }
          }

          db.close((err) => {
            if (err) {
              debug(this.options.debug, LogType.error,"cache-task-runner: Error while closing db after retrieving cache item ", err);
            }
          });
        });
      } catch (e) {
        debug(this.options.debug, LogType.error,"cache-task-runner: Error while retrieving cache item ", e);
        resolve(false);
      }
    });
  }

  async store(hash: string, cacheDirectory: string): Promise<boolean> {
    const dbAndLevelDownInstance = this.getDb();
    if (!dbAndLevelDownInstance) {
      return false;
    }

    const { db, leveldownInstance } = dbAndLevelDownInstance;

    try {
      const buffer = await this.archiveFromDir(hash, cacheDirectory);

      debug(this.options.debug, LogType.log,`cache-task-runner: Zipped directory ${cacheDirectory} with hash ${hash}`);

      return new Promise((resolve, reject) => {
        try {
          db.put(hash, buffer, async (err) => {
            if (err) {
              debug(this.options.debug, LogType.error,"cache-task-runner: Error while storing cache item ", err);
              resolve(false);
            } else {
              debug(this.options.debug, LogType.log,"cache-task-runner: Storing Item with hash ", hash);
              resolve(true);
            }

            // Some leveldown drivers like redis have an expire method
            if (this.options.time_to_live && leveldownInstance.db && isFunction(leveldownInstance.db.expire)) {
              leveldownInstance.db.expire(hash, this.options.time_to_live, async (expireErr) => {
                db.close((err) => {
                  if (err) {
                    debug(this.options.debug, LogType.error,"cache-task-runner: Error while closing db after storing cache item ", err);
                  }
                });
              });
            } else {
              db.close((err) => {
                if (err) {
                  debug(this.options.debug, LogType.error,"cache-task-runner: Error while closing db after storing cache item ", err);
                }
              });
            }
            
          });
        } catch (e) {
          debug(this.options.debug, LogType.error,"cache-task-runner: Error while storing cache item ", e);
          resolve(false);
        }
      });
    } catch (e) {
      debug(this.options.debug, LogType.error,"cache-task-runner: Error while storing cache item ", e);
      return Promise.resolve(false);
    }
  }

  private async archiveFromDir(hash: string, cacheDirectory: string): Promise<Buffer> {
    return await archive(path.join(cacheDirectory, hash), {format: 'tar'});
    }

  private async unarchiveIntoDir(archive: string, cacheDirectory: string): Promise<void> {
    return await extract(archive, cacheDirectory, {format: 'tar'});
  }

  private getDb(): { db: LevelUp, leveldownInstance: any } {
    try {
      const driver = this.getDriver();
      const name = this.options.name || "cache-task-runner";
      const leveldownInstance = isFunction(driver) ? driver(name, this.driverOptions) : driver;
      return leveldownInstance
        ? { db: new levelUp(leveldownInstance, this.driverOptions as any), leveldownInstance: leveldownInstance }
        : null;
    } catch (e) {
      debug(this.options.debug, LogType.error,"cache-task-runner: Error while creating level db ", e);
    }
  }

  private getDriverOptions(options: any) {
    options = options || {};
    const finalOptions = clone(options);

    // we need to check if the environment has any parameters -- those take
    // priority over the passed options
    for (const key in process.env) {
      const keyToLowercase = key.toLowerCase();
      if (keyToLowercase.startsWith(cacheOptionsEnvKeyPrefix)) {
        const suffix = key.substring(cacheOptionsEnvKeyPrefix.length);
        const suffixToLowercase = suffix.toLowerCase();
        if (
          suffixToLowercase === cacheOptionsEnvKeyDriver ||
          suffixToLowercase === cacheOptionsEnvKeyName ||
          suffixToLowercase === cacheOptionsEnvKeyTimeToLive
        ) {
          finalOptions[suffixToLowercase] = process.env[key];
        } else {
          finalOptions[suffix] = process.env[key];
        }
      }
    }

    // customize driver options based on driver.
    switch (options[cacheOptionsEnvKeyDriver]) {
      case "redisdown":
        finalOptions["ownClient"] = true;
        break;
      default:
      // nothing
    }

    return finalOptions;
  }

  private getDriver() {
    if (this.options.driver) {
      const loadedDriver = require(this.options.driver);
      return loadedDriver;
    } else {
      return null;
    }
  }
}

enum LogType{
  error, 
  log
}

function debug(debug ,type: LogType, message?: any, ...optionalParams: any[]) {
  if ( debug ) {
    switch (type) {
      case LogType.log:
        console.log(message, optionalParams)
        break;
    
      case LogType.error:
        console.error(message, optionalParams)
        break;
    }
  }
}
