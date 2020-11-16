import * as _ from 'lodash';
import * as C from './constants';

const transforms = {
    string: value => '' + value,
    number: parseInt,
    boolean: value => !!value,
    price: value => parseInt((1000 * value).toFixed(0)),
    userString: value => ('' + (value || '')).substring(0, 100),
    userText: value => ('' + (value || '')).substring(0, 1000),
    'string[]': value => _.isArray(value) ? _.map(value, i => '' + i) : undefined,
    'number[]': value => _.isArray(value) ? _.map(value, i => parseInt(i, 10)) : undefined,
    'bodypart[]': value => _.filter(value, i => C.BODYPARTS_ALL.includes(i)),
};

const intents = {
    notify: { message: 'userText', groupInterval: 'number' },
    createConstructionSite: { roomName: 'string', x: 'number', y: 'number', structureType: 'string', name: 'string' },
    createFlag: { roomName: 'string', x: 'number', y: 'number', name: 'string', color: 'number', secondaryColor: 'number' },
    destroyStructure: { roomName: 'string', id: 'string' },
    removeConstructionSite: { roomName: 'string', id: 'string' },
    removeFlag: { roomName: 'string', name: 'string' },
    cancelOrder: { orderId: 'string' },
    changeOrderPrice: { orderId: 'string', newPrice: 'price' },
    createOrder: { type: 'string', resourceType: 'string', price: 'price', totalAmount: 'number', roomName: 'string' },
    createPowerCreep: { name: 'string', className: 'string' },
    deal: { orderId: 'string', amount: 'number', targetRoomName: 'string' },
    deletePowerCreep: { id: 'string', cancel: 'boolean' },
    extendOrder: { orderId: 'string', addAmount: 'number' },
    renamePowerCreep: { id: 'string', name: 'string' },
    spawnPowerCreep: { id: 'string', name: 'string' },
    suicidePowerCreep: { id: 'string' },
    upgradePowerCreep: { id: 'string', power: 'number' },
    activateSafeMode: {},
    attack: { id: 'string', x: 'number', y: 'number' },
    attackController: { id: 'string' },
    boostCreep: { id: 'string', bodyPartsCount: 'number' },
    build: { id: 'string', x: 'number', y: 'number' },
    cancelSpawning: {},
    claimController: { id: 'string' },
    createCreep: { name: 'string', body: 'bodypart[]', energyStructures: 'string[]', directions: 'number[]' },
    destroy: {},
    dismantle: { id: 'string' },
    drop: { amount: 'number', resourceType: 'string' },
    enableRoom: { id: 'string' },
    generateSafeMode: { id: 'string' },
    harvest: { id: 'string' },
    heal: { id: 'string', x: 'number', y: 'number' },
    launchNuke: { x: 'number', y: 'number', roomName: 'string' },
    move: { id: 'string', direction: 'number' },
    notifyWhenAttacked: { enabled: 'boolean' },
    observeRoom: { roomName: 'string' },
    pickup: { id: 'string' },
    processPower: {},
    produce: { resourceType: 'string', amount: 'number' },
    pull: { id: 'string' },
    rangedAttack: { id: 'string' },
    rangedHeal: { id: 'string' },
    rangedMassAttack: {},
    recycleCreep: { id: 'string' },
    renew: { id: 'string' },
    renewCreep: { id: 'string' },
    reverseReaction: { lab1: 'string', lab2: 'string' },
    runReaction: { lab1: 'string', lab2: 'string' },
    remove: {},
    repair: { id: 'string', x: 'number', y: 'number' },
    reserveController: { id: 'string' },
    say: { message: 'userString', isPublic: 'boolean' },
    send: { targetRoomName: 'string', resourceType: 'string', amount: 'number', description: 'userString' },
    setColor: { color: 'number', secondaryColor: 'number' },
    setPosition: { x: 'number', y: 'number', roomName: 'string' },
    setPublic: { isPublic: 'boolean' },
    setSpawnDirections: { directions: 'number[]' },
    signController: { id: 'string', sign: 'userString' },
    suicide: {},
    transfer: { id: 'string', amount: 'number', resourceType: 'string' },
    unboostCreep: { id: 'string' },
    unclaim: {},
    upgradeController: { id: 'string' },
    usePower: { power: 'number', id: 'string' },
    withdraw: { id: 'string', amount: 'number', resourceType: 'string' }
};

/** */
function sanitizeIntent(name: string, intent: Record<string, string>) {
    const result = {};

    for (const field of Object.values<string>(intents[name])) {
        result[field] = transforms[intents[name][field]](intent[field]);
    }

    return result;
}

/** */
export function sanitizeUserIntents(input: Record<string, string | Record<string, string>>) {
    const intentResult = {};
    for (const name of Object.keys(intents)) {
        if (input[name]) {
            intentResult[name] = _.isArray(input[name]) ?
                _.map(input[name], i => sanitizeIntent(name, i)) :
                sanitizeIntent(name, input[name] as Record<string, string>);
        }
    }

    return intentResult;
}

/** */
export function sanitizeUserRoomIntents(input, result, groupingField = 'roomName') {
    for (const name of Object.keys(intents)) {
        if (input[name]) {
            for (const intent of input[name]) {
                const sanitized = sanitizeIntent(name, intent);
                const groupingValue = sanitized[groupingField];
                const roomNameResult = result[groupingValue] = result[groupingValue] || {};
                const roomResult = roomNameResult.room = roomNameResult.room || {};
                (roomResult[name] = roomResult[name] || []).push(sanitized);
            }
        }
    }
}
