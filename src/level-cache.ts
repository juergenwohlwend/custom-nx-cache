import { archive, extract } from "simple-archiver";
import { clone, isFunction } from "lodash";
import { RemoteCache } from "@nrwl/workspace/src/tasks-runner/tasks-runner-v2";
import fs from "fs";
import levelUp, { LevelUp } from "levelup";
import path from "path";

export interface ILevelCacheOptions {
  driver?: string;
  name?: string;
  time_to_live?: number;
}

const cacheOptionsEnvKeyPrefix = "level_task_runner_";
const cacheOptionsEnvKeyDriver = "driver";
const cacheOptionsEnvKeyName = "name";
const cacheOptionsEnvKeyTimeToLive = "time_to_live";

export class LevelCache implements RemoteCache {
  private options: ILevelCacheOptions;
  private driverOptions: any;

  constructor(options?: ILevelCacheOptions) {
    this.driverOptions = this.getDriverOptions(options || {});

    this.options = {
      [cacheOptionsEnvKeyDriver]: this.driverOptions[cacheOptionsEnvKeyDriver],
      [cacheOptionsEnvKeyName]: this.driverOptions[cacheOptionsEnvKeyName],
      [cacheOptionsEnvKeyTimeToLive]: this.driverOptions[cacheOptionsEnvKeyTimeToLive],
    };

    delete this.driverOptions[cacheOptionsEnvKeyDriver];
    delete this.driverOptions[cacheOptionsEnvKeyName];
    delete this.driverOptions[cacheOptionsEnvKeyTimeToLive];
  }

  async retrieve(hash: string, cacheDirectory: string): Promise<boolean> {
    const dbAndLevelDownInstance = this.getDb();
    if (!dbAndLevelDownInstance) {
      return false;
    }

    const { db } = dbAndLevelDownInstance;

    return new Promise((resolve, reject) => {
      try {
        console.log("cache-task-runner: Retrieving cache for ", hash);
        db.get(hash, async (err, value) => {
          if (err) {
            console.error("cache-task-runner: Error while retrieving cache item ", err);
            resolve(false);
          } else {
            try {
              console.log("cache-task-runner: stored value", value, cacheDirectory)

              fs.writeFileSync(path.join(cacheDirectory, `test.b64`), value);

              await this.unarchiveIntoDir(value, cacheDirectory);
              fs.writeFileSync(path.join(cacheDirectory, `${hash}.commit`), "true");
              
           
              console.log("cache-task-runner: Retrieved cache for ", hash);
              resolve(true);
            } catch (e) {
              console.error("cache-task-runner: Error while retrieving cache item ", e);
              resolve(false);
            }
          }

          db.close((err) => {
            if (err) {
              console.error("cache-task-runner: Error while closing db after retrieving cache item ", err);
            }
          });
        });
      } catch (e) {
        console.error("cache-task-runner: Error while retrieving cache item ", e);
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

      console.log(`cache-task-runner: Zipped directory ${cacheDirectory} with hash ${hash}`);

      return new Promise((resolve, reject) => {
        try {
          db.put(hash, buffer, async (err) => {
            if (err) {
              console.error("cache-task-runner: Error while storing cache item ", err);
              resolve(false);
            } else {
              console.log("cache-task-runner: Storing Item with hash ", hash);
              resolve(true);
            }

            // Some leveldown drivers like redis have an expire method
            if (this.options.time_to_live && leveldownInstance.db && isFunction(leveldownInstance.db.expire)) {
              leveldownInstance.db.expire(hash, this.options.time_to_live, async (expireErr) => {
                db.close((err) => {
                  if (err) {
                    console.error("level-cache-task-runner: Error while closing db after storing cache item ", err);
                  }
                });
              });
            } else {
              db.close((err) => {
                if (err) {
                  console.error("level-cache-task-runner: Error while closing db after storing cache item ", err);
                }
              });
            }
            
          });
        } catch (e) {
          console.error("cache-task-runner: Error while storing cache item ", e);
          resolve(false);
        }
      });
    } catch (e) {
      console.error("cache-task-runner: Error while storing cache item ", e);
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
      console.error("cache-task-runner: Error while creating level db ", e);
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
