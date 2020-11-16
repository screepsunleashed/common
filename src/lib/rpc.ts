import { Writable } from 'stream';
import * as q from 'q';
import { EventEmitter } from 'events';
import { Socket } from 'net';

export class JSONFrameStream extends Writable {

    handler: any;
    frame: {
        data: Buffer;
        pointer?: number;
        size?: number;
    };

    constructor(handler: any, options?) {
        super(options);
        this.handler = handler;
        this.frame = null;
    }

    static makeFrame(obj): Buffer {
        const data = Buffer.from(JSON.stringify(obj), 'utf8');
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        return Buffer.concat([length, data]);
    }

    _write(chunk, encoding: string, callback) {
        this._parse(chunk);
        callback();
    }

    _parse(buffer) {
        if (!buffer.length) {
            return;
        }
        if (!this.frame) {
            this.frame = {
                data: Buffer.alloc(4),
                pointer: 0
            };
        }
        if (!this.frame.size) {
            const length = Math.min(buffer.length, 4 - this.frame.pointer);
            buffer.copy(this.frame.data, this.frame.pointer, 0, length);
            this.frame.pointer += length;
            if (this.frame.pointer === 4) {
                this.frame.size = this.frame.data.readUInt32BE();
                this.frame.data = Buffer.alloc(this.frame.size);
                this.frame.pointer = 0;
            }
            return this._parse(buffer.slice(length));
        } else {
            const length = Math.min(buffer.length, this.frame.size - this.frame.pointer);
            buffer.copy(this.frame.data, this.frame.pointer, 0, length);
            this.frame.pointer += length;
            if (this.frame.pointer === this.frame.size) {
                this.handler(JSON.parse(this.frame.data.toString('utf8')));
                this.frame = null;
            }
            return this._parse(buffer.slice(length));
        }
    }
}

export class RpcServer {

    socket: Socket;
    methods: any;
    channelUnsubscribe: Map<string, any>;

    constructor(socket: Socket, methods) {
        this.socket = socket;
        this.socket.pipe(new JSONFrameStream(this._processFrame.bind(this)));
        this.methods = methods;
        this.channelUnsubscribe = new Map();
        this.socket.on('close', () => {
            this.channelUnsubscribe.forEach(unsubscribe => unsubscribe());
            this.channelUnsubscribe.clear();
        });
    }

    _processFrame(obj) {
        let args = obj.args || [];
        if (obj.method === 'subscribe') {
            if (this.channelUnsubscribe.has('*')) {
                return;
            }
            if (obj.channel === '*') {
                this.channelUnsubscribe.forEach(unsubscribe => unsubscribe());
                this.channelUnsubscribe.clear();
            }
            if (!this.channelUnsubscribe.has(obj.channel)) {
                let unsubscribe = this.methods.subscribe(obj.channel, (pubsub) => {
                    this.socket.write(JSONFrameStream.makeFrame({ pubsub }));
                });
                this.channelUnsubscribe.set(obj.channel, unsubscribe);
            }
            return;
        }
        this.methods[obj.method].apply(null, args.concat([(error, result) => {
            let response = {
                id: obj.id,
                error,
                result: error ? undefined : result
            };
            this.socket.write(JSONFrameStream.makeFrame(response));
        }]));
    }
}

export class RpcClient {

    socket: Socket;
    requestId: number;
    defers: Map<any, any>;
    pubsub: EventEmitter;

    constructor(socket: Socket) {
        this.socket = socket;
        this.socket.pipe(new JSONFrameStream(this._processFrame.bind(this)));
        this.requestId = 0;
        this.defers = new Map();
        this.pubsub = new EventEmitter();
    }

    _processFrame(obj) {
        if (obj.pubsub) {
            this.pubsub.emit(obj.pubsub.channel, obj.pubsub.channel, obj.pubsub.data);
            this.pubsub.emit('*', obj.pubsub.channel, obj.pubsub.data);
            return;
        }
        if (!this.defers.has(obj.id)) {
            console.error('invalid request id', obj.id);
            return;
        }
        if (obj.error) {
            this.defers.get(obj.id).reject(obj.error);
        } else {
            this.defers.get(obj.id).resolve(obj.result);
        }
        this.defers.delete(obj.id);
    }

    request(method, ...args) {
        this.requestId++;
        let request = {
            id: this.requestId,
            method,
            args
        };
        this.socket.write(JSONFrameStream.makeFrame(request));
        let defer = q.defer();
        this.defers.set(this.requestId, defer);
        return defer.promise;
    }

    subscribe(channelToSubscribe, callback) {
        let request = {
            method: 'subscribe',
            channel: channelToSubscribe
        };
        this.socket.write(JSONFrameStream.makeFrame(request));
        this.pubsub.addListener(channelToSubscribe, (channel, ...args) => {
            callback.apply({ channel }, args);
        });
    }
}