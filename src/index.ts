import * as q from 'q';
import * as net from 'net';
import * as _ from 'lodash';
import * as storage from './lib/storage';

export * as configManager from './lib/config-manager';
export * as storage from './lib/storage';
export * as rpc from './lib/rpc';

export function findPort(port: number) {
    const defer = q.defer();
    const server = net.createServer(socket => socket.end());
    server.listen(port, () => {
        server.once('close', function () {
            defer.resolve(port);
        });
        server.close();
    });
    server.on('error', (err) => {
        defer.resolve(findPort(port + 1));
    });
    return defer.promise;
}

export function encodeTerrain(terrain: any) {
    let result = '';
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            let objects = _.filter(terrain, { x, y }),
                code = 0;
            if (_.some(objects, { type: 'wall' })) {
                code = code | 1;
            }
            if (_.some(objects, { type: 'swamp' })) {
                code = code | 2;
            }
            result = result + code;
        }
    }
    return result;
}

export function decodeTerrain(str: string, room: any) {
    const result = [];

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const code = parseInt(str.charAt(y * 50 + x), 10);
            if (code & 1) {
                result.push({ room, x, y, type: 'wall' });
            }
            if (code & 2) {
                result.push({ room, x, y, type: 'swamp' });
            }
        }
    }

    return result;
}

export function checkTerrain(terrain, x, y, mask) {
    return (parseInt(terrain.charAt(y * 50 + x), 10) & mask) > 0;
}

/** */
export function getGametime() {
    return storage.env.get(storage.env.keys.GAMETIME).then(data => parseInt(data));
}

/** */
export function getDiff(oldData, newData) {

    function getIndex(data) {
        let index = {};
        _.forEach(data, (obj) => index[obj._id] = obj);
        return index;
    }


    let result = {};
    let oldIndex = getIndex(oldData);
    let newIndex = getIndex(newData);

    _.forEach(oldData, (obj) => {
        if (newIndex[obj._id]) {
            let newObj = newIndex[obj._id];
            let objDiff = result[obj._id] = {};
            for (let key in obj) {
                if (_.isUndefined(newObj[key])) {
                    objDiff[key] = null;
                } else if ((typeof obj[key]) !== (typeof newObj[key]) || obj[key] && !newObj[key]) {
                    objDiff[key] = newObj[key];
                } else if (_.isObject(obj[key])) {

                    objDiff[key] = {};

                    for (let subkey in obj[key]) {
                        if (!_.isEqual(obj[key][subkey], newObj[key][subkey])) {
                            objDiff[key][subkey] = newObj[key][subkey];
                        }
                    }
                    for (let subkey in newObj[key]) {
                        if (_.isUndefined(obj[key][subkey])) {
                            objDiff[key][subkey] = newObj[key][subkey];
                        }
                    }
                    if (!_.size(objDiff[key])) {
                        delete result[obj._id][key];
                    }
                } else if (!_.isEqual(obj[key], newObj[key])) {
                    objDiff[key] = newObj[key];
                }
            }
            for (let key in newObj) {
                if (_.isUndefined(obj[key])) {
                    objDiff[key] = newObj[key];
                }
            }
            if (!_.size(objDiff)) {
                delete result[obj._id];
            }
        } else {
            result[obj._id] = null;
        }
    });

    _.forEach(newData, (obj) => {
        if (!oldIndex[obj._id]) {
            result[obj._id] = obj;
        }
    });

    return result;
}

/** */
export function qSequence(collection, fn) {
    return _.reduce(collection, (promise, element, key) => promise.then(() => fn(element, key)), q.when());
}

/** Takes a room name in the format of 'W3N6' and returns the x/y coordinates */
export function roomNameToXY(name: string): [number, number] {
    const match = name.toUpperCase().match(/^(\w)(\d+)(\w)(\d+)$/);
    if (!match) return [undefined, undefined];
    let [, hor, x, ver, y] = match;
    return [hor === 'W' ? -x - 1 : +x, ver === 'N' ? -y - 1 : +y];
}

/** Calculates the room name string based on x/y coordinates */
export function getRoomNameFromXY(x: number, y: number): string {
    return `${x < 0 ? 'W' + (-x - 1) : 'E' + (x)}${y < 0 ? 'N' + (-y - 1) : 'S' + (y)}`;
}

/** Calculates the size of the world based on the rooms in the world */
export function calcWorldSize(rooms: any[]): number {
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    rooms.forEach(room => {
        const [x, y] = roomNameToXY(room._id);
        if (x < minX) { minX = x; }
        if (y < minY) { minY = y; }
        if (x > maxX) { maxX = x; }
        if (y > maxY) { maxY = y; }
    });
    return Math.max(maxX - minX + 1, maxY - minY + 1);
}