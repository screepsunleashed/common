import * as q from 'q';
import * as net from 'net';
import { config } from './config-manager';
import { RpcClient } from './rpc';

/** Wraps a collection from the storage implementation in easy to use functions */
interface WrappedCollection {
    find: (...args) => q.Promise<unknown>;
    findOne: (...args) => q.Promise<unknown>;
    by: (...args) => q.Promise<unknown>;
    clear: (...args) => q.Promise<unknown>;
    count: (...args) => q.Promise<unknown>;
    ensureIndex: (...args) => q.Promise<unknown>;
    removeWhere: (...args) => q.Promise<unknown>;
    insert: (...args) => q.Promise<unknown>;
    update: (query, update, params) => q.Promise<unknown>;
    bulk: (bulk) => q.Promise<unknown>;
    findEx: (query, opts) => q.Promise<unknown>;
}

let rpcClient: RpcClient;

function resetInterceptor<T>(fn: T) { return fn; }

export const env = {
    keys: {
        ACCESSIBLE_ROOMS: 'accessibleRooms',
        ROOM_STATUS_DATA: 'roomStatusData',
        MEMORY: 'memory:',
        GAMETIME: 'gameTime',
        MAP_VIEW: 'mapView:',
        TERRAIN_DATA: 'terrainData',
        SCRIPT_CACHED_DATA: 'scriptCachedData:',
        USER_ONLINE: 'userOnline:',
        MAIN_LOOP_PAUSED: 'mainLoopPaused',
        ROOM_HISTORY: 'roomHistory:',
        ROOM_VISUAL: 'roomVisual:',
        MEMORY_SEGMENTS: 'memorySegments:',
        PUBLIC_MEMORY_SEGMENTS: 'publicMemorySegments:',
        ROOM_EVENT_LOG: 'roomEventLog:',
        ACTIVE_ROOMS: 'activeRooms',
        MAIN_LOOP_MIN_DURATION: 'tickRate'
    },
    get: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvGet')),
    mget: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvMget')),
    set: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvSet')),
    setex: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvSetex')),
    expire: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvExpire')),
    ttl: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvTtl')),
    del: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvDel')),
    hmget: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvHmget')),
    hmset: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvHmset')),
    hget: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvHget')),
    hset: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvHset')),
    sadd: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvSadd')),
    smembers: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvSmembers')),
};

export const pubsub = {
    keys: {
        QUEUE_DONE: 'queueDone:',
        RUNTIME_RESTART: 'runtimeRestart',
        TICK_STARTED: 'tickStarted',
        ROOMS_DONE: 'roomsDone'
    },
    publish: resetInterceptor(rpcClient.request.bind(rpcClient, 'publish')),
    subscribe(channel, cb) { rpcClient.subscribe(channel, cb); }
};

export const db: Record<string, WrappedCollection> = {};

export const queue = {
    fetch: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueFetch')),
    add: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueAdd')),
    addMulti: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueAddMulti')),
    markDone: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueMarkDone')),
    whenAllDone: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueWhenAllDone')),
    reset: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueReset'))
};


export let _connected = false;

export function _connect() {

    if (_connected) { return q.when(); }

    if (!process.env.STORAGE_PORT) {
        throw new Error('STORAGE_PORT environment variable is not set!');
    }

    console.log('Connecting to storage');

    const socket = net.connect(parseInt(process.env.STORAGE_PORT, 10), process.env.STORAGE_HOST);
    rpcClient = new RpcClient(socket);

    const defer = q.defer();
    const resetDefer = q.defer();

    /** Takes a collection from storage and wraps it in convenient methods for manipulating the data */
    function wrapCollection(collectionName: string): WrappedCollection{
        const fn = (method) => (...args) => {
            return rpcClient.request('dbRequest', collectionName, method, Array.prototype.slice.call(args));
        };
        return {
            find: fn('find'),
            findOne: fn('findOne'),
            by: fn('by'),
            clear: fn('clear'),
            count: fn('count'),
            ensureIndex: fn('ensureIndex'),
            removeWhere: fn('removeWhere'),
            insert: fn('insert'),
            update: resetInterceptor((query, update, params) => rpcClient.request('dbUpdate', collectionName, query, update, params)),
            bulk: resetInterceptor((bulk) => rpcClient.request('dbBulk', collectionName, bulk)),
            findEx: resetInterceptor((query, opts) => rpcClient.request('dbFindEx', collectionName, query, opts))

        };
    }

    config.common.dbCollections.forEach((i: any) => db[i] = wrapCollection(i));

    _connected = true;

    defer.resolve();

    socket.on('error', err => {
        console.error('Storage connection lost', err);
        resetDefer.resolve('reset');
        _connected = false;
        setTimeout(_connect, 1000);
    });
    socket.on('end', () => {
        console.error('Storage connection lost');
        resetDefer.resolve('reset');
        _connected = false;
        setTimeout(_connect, 1000);
    });

    return defer.promise;
}

export function resetAllData() { rpcClient?.request('dbResetAllData'); }