/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const messages = $root.messages = (() => {

    /**
     * Namespace messages.
     * @exports messages
     * @namespace
     */
    const messages = {};

    messages.Message = (function() {

        /**
         * Properties of a Message.
         * @memberof messages
         * @interface IMessage
         * @property {collab.ICollabMessage|null} [collabMessage] Message collabMessage
         * @property {notification.IWorkspaceNotification|null} [notification] Message notification
         */

        /**
         * Constructs a new Message.
         * @memberof messages
         * @classdesc All messages send between client/server are wrapped into a `Message`.
         * @implements IMessage
         * @constructor
         * @param {messages.IMessage=} [properties] Properties to set
         */
        function Message(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Message collabMessage.
         * @member {collab.ICollabMessage|null|undefined} collabMessage
         * @memberof messages.Message
         * @instance
         */
        Message.prototype.collabMessage = null;

        /**
         * Message notification.
         * @member {notification.IWorkspaceNotification|null|undefined} notification
         * @memberof messages.Message
         * @instance
         */
        Message.prototype.notification = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        /**
         * Message payload.
         * @member {"collabMessage"|"notification"|undefined} payload
         * @memberof messages.Message
         * @instance
         */
        Object.defineProperty(Message.prototype, "payload", {
            get: $util.oneOfGetter($oneOfFields = ["collabMessage", "notification"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new Message instance using the specified properties.
         * @function create
         * @memberof messages.Message
         * @static
         * @param {messages.IMessage=} [properties] Properties to set
         * @returns {messages.Message} Message instance
         */
        Message.create = function create(properties) {
            return new Message(properties);
        };

        /**
         * Encodes the specified Message message. Does not implicitly {@link messages.Message.verify|verify} messages.
         * @function encode
         * @memberof messages.Message
         * @static
         * @param {messages.IMessage} message Message message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Message.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.collabMessage != null && Object.hasOwnProperty.call(message, "collabMessage"))
                $root.collab.CollabMessage.encode(message.collabMessage, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.notification != null && Object.hasOwnProperty.call(message, "notification"))
                $root.notification.WorkspaceNotification.encode(message.notification, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified Message message, length delimited. Does not implicitly {@link messages.Message.verify|verify} messages.
         * @function encodeDelimited
         * @memberof messages.Message
         * @static
         * @param {messages.IMessage} message Message message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Message.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Message message from the specified reader or buffer.
         * @function decode
         * @memberof messages.Message
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {messages.Message} Message
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Message.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            const end = length === undefined ? reader.len : reader.pos + length, message = new $root.messages.Message();

            while (reader.pos < end) {
                const tag = reader.uint32();

                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.collabMessage = $root.collab.CollabMessage.decode(reader, reader.uint32());
                        break;
                    }

                case 2: {
                        message.notification = $root.notification.WorkspaceNotification.decode(reader, reader.uint32());
                        break;
                    }

                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }

            return message;
        };

        /**
         * Decodes a Message message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof messages.Message
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {messages.Message} Message
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Message.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Message message.
         * @function verify
         * @memberof messages.Message
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Message.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            const properties = {};

            if (message.collabMessage != null && message.hasOwnProperty("collabMessage")) {
                properties.payload = 1;
                {
                    const error = $root.collab.CollabMessage.verify(message.collabMessage);

                    if (error)
                        return "collabMessage." + error;
                }
            }

            if (message.notification != null && message.hasOwnProperty("notification")) {
                if (properties.payload === 1)
                    return "payload: multiple values";
                properties.payload = 1;
                {
                    const error = $root.notification.WorkspaceNotification.verify(message.notification);

                    if (error)
                        return "notification." + error;
                }
            }

            return null;
        };

        /**
         * Creates a Message message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof messages.Message
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {messages.Message} Message
         */
        Message.fromObject = function fromObject(object) {
            if (object instanceof $root.messages.Message)
                return object;
            const message = new $root.messages.Message();

            if (object.collabMessage != null) {
                if (typeof object.collabMessage !== "object")
                    throw TypeError(".messages.Message.collabMessage: object expected");
                message.collabMessage = $root.collab.CollabMessage.fromObject(object.collabMessage);
            }

            if (object.notification != null) {
                if (typeof object.notification !== "object")
                    throw TypeError(".messages.Message.notification: object expected");
                message.notification = $root.notification.WorkspaceNotification.fromObject(object.notification);
            }

            return message;
        };

        /**
         * Creates a plain object from a Message message. Also converts values to other types if specified.
         * @function toObject
         * @memberof messages.Message
         * @static
         * @param {messages.Message} message Message
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Message.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            const object = {};

            if (message.collabMessage != null && message.hasOwnProperty("collabMessage")) {
                object.collabMessage = $root.collab.CollabMessage.toObject(message.collabMessage, options);
                if (options.oneofs)
                    object.payload = "collabMessage";
            }

            if (message.notification != null && message.hasOwnProperty("notification")) {
                object.notification = $root.notification.WorkspaceNotification.toObject(message.notification, options);
                if (options.oneofs)
                    object.payload = "notification";
            }

            return object;
        };

        /**
         * Converts this Message to JSON.
         * @function toJSON
         * @memberof messages.Message
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Message.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Message
         * @function getTypeUrl
         * @memberof messages.Message
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Message.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }

            return typeUrlPrefix + "/messages.Message";
        };

        return Message;
    })();

    return messages;
})();

export const collab = $root.collab = (() => {

    /**
     * Namespace collab.
     * @exports collab
     * @namespace
     */
    const collab = {};

    collab.Rid = (function() {

        /**
         * Properties of a Rid.
         * @memberof collab
         * @interface IRid
         * @property {number|Long|null} [timestamp] Rid timestamp
         * @property {number|null} [counter] Rid counter
         */

        /**
         * Constructs a new Rid.
         * @memberof collab
         * @classdesc Rid represents Redis stream message Id, which is a unique identifier
         * in scope of individual Redis stream - here workspace scope - assigned
         * to each update stored in Redis.
         * 
         * Default: "0-0"
         * @implements IRid
         * @constructor
         * @param {collab.IRid=} [properties] Properties to set
         */
        function Rid(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Rid timestamp.
         * @member {number|Long} timestamp
         * @memberof collab.Rid
         * @instance
         */
        Rid.prototype.timestamp = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

        /**
         * Rid counter.
         * @member {number} counter
         * @memberof collab.Rid
         * @instance
         */
        Rid.prototype.counter = 0;

        /**
         * Creates a new Rid instance using the specified properties.
         * @function create
         * @memberof collab.Rid
         * @static
         * @param {collab.IRid=} [properties] Properties to set
         * @returns {collab.Rid} Rid instance
         */
        Rid.create = function create(properties) {
            return new Rid(properties);
        };

        /**
         * Encodes the specified Rid message. Does not implicitly {@link collab.Rid.verify|verify} messages.
         * @function encode
         * @memberof collab.Rid
         * @static
         * @param {collab.IRid} message Rid message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Rid.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.timestamp != null && Object.hasOwnProperty.call(message, "timestamp"))
                writer.uint32(/* id 1, wireType 1 =*/9).fixed64(message.timestamp);
            if (message.counter != null && Object.hasOwnProperty.call(message, "counter"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.counter);
            return writer;
        };

        /**
         * Encodes the specified Rid message, length delimited. Does not implicitly {@link collab.Rid.verify|verify} messages.
         * @function encodeDelimited
         * @memberof collab.Rid
         * @static
         * @param {collab.IRid} message Rid message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Rid.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Rid message from the specified reader or buffer.
         * @function decode
         * @memberof collab.Rid
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {collab.Rid} Rid
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Rid.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            const end = length === undefined ? reader.len : reader.pos + length, message = new $root.collab.Rid();

            while (reader.pos < end) {
                const tag = reader.uint32();

                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.timestamp = reader.fixed64();
                        break;
                    }

                case 2: {
                        message.counter = reader.uint32();
                        break;
                    }

                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }

            return message;
        };

        /**
         * Decodes a Rid message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof collab.Rid
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {collab.Rid} Rid
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Rid.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Rid message.
         * @function verify
         * @memberof collab.Rid
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Rid.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                if (!$util.isInteger(message.timestamp) && !(message.timestamp && $util.isInteger(message.timestamp.low) && $util.isInteger(message.timestamp.high)))
                    return "timestamp: integer|Long expected";
            if (message.counter != null && message.hasOwnProperty("counter"))
                if (!$util.isInteger(message.counter))
                    return "counter: integer expected";
            return null;
        };

        /**
         * Creates a Rid message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof collab.Rid
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {collab.Rid} Rid
         */
        Rid.fromObject = function fromObject(object) {
            if (object instanceof $root.collab.Rid)
                return object;
            const message = new $root.collab.Rid();

            if (object.timestamp != null)
                if ($util.Long)
                    (message.timestamp = $util.Long.fromValue(object.timestamp)).unsigned = false;
                else if (typeof object.timestamp === "string")
                    message.timestamp = parseInt(object.timestamp, 10);
                else if (typeof object.timestamp === "number")
                    message.timestamp = object.timestamp;
                else if (typeof object.timestamp === "object")
                    message.timestamp = new $util.LongBits(object.timestamp.low >>> 0, object.timestamp.high >>> 0).toNumber();
            if (object.counter != null)
                message.counter = object.counter >>> 0;
            return message;
        };

        /**
         * Creates a plain object from a Rid message. Also converts values to other types if specified.
         * @function toObject
         * @memberof collab.Rid
         * @static
         * @param {collab.Rid} message Rid
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Rid.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            const object = {};

            if (options.defaults) {
                if ($util.Long) {
                    const long = new $util.Long(0, 0, false);

                    object.timestamp = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.timestamp = options.longs === String ? "0" : 0;
                object.counter = 0;
            }

            if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                if (typeof message.timestamp === "number")
                    object.timestamp = options.longs === String ? String(message.timestamp) : message.timestamp;
                else
                    object.timestamp = options.longs === String ? $util.Long.prototype.toString.call(message.timestamp) : options.longs === Number ? new $util.LongBits(message.timestamp.low >>> 0, message.timestamp.high >>> 0).toNumber() : message.timestamp;
            if (message.counter != null && message.hasOwnProperty("counter"))
                object.counter = message.counter;
            return object;
        };

        /**
         * Converts this Rid to JSON.
         * @function toJSON
         * @memberof collab.Rid
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Rid.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Rid
         * @function getTypeUrl
         * @memberof collab.Rid
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Rid.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }

            return typeUrlPrefix + "/collab.Rid";
        };

        return Rid;
    })();

    collab.SyncRequest = (function() {

        /**
         * Properties of a SyncRequest.
         * @memberof collab
         * @interface ISyncRequest
         * @property {collab.IRid|null} [lastMessageId] SyncRequest lastMessageId
         * @property {Uint8Array|null} [stateVector] SyncRequest stateVector
         */

        /**
         * Constructs a new SyncRequest.
         * @memberof collab
         * @classdesc SyncRequest message is send by either a server or a client, which informs about the
         * last collab state known to either party.
         * 
         * If other side has more recent data, it should send `Update` message in the response.
         * If other side has missing data, it should send its own `SyncRequest` in the response.
         * @implements ISyncRequest
         * @constructor
         * @param {collab.ISyncRequest=} [properties] Properties to set
         */
        function SyncRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SyncRequest lastMessageId.
         * @member {collab.IRid|null|undefined} lastMessageId
         * @memberof collab.SyncRequest
         * @instance
         */
        SyncRequest.prototype.lastMessageId = null;

        /**
         * SyncRequest stateVector.
         * @member {Uint8Array} stateVector
         * @memberof collab.SyncRequest
         * @instance
         */
        SyncRequest.prototype.stateVector = $util.newBuffer([]);

        /**
         * Creates a new SyncRequest instance using the specified properties.
         * @function create
         * @memberof collab.SyncRequest
         * @static
         * @param {collab.ISyncRequest=} [properties] Properties to set
         * @returns {collab.SyncRequest} SyncRequest instance
         */
        SyncRequest.create = function create(properties) {
            return new SyncRequest(properties);
        };

        /**
         * Encodes the specified SyncRequest message. Does not implicitly {@link collab.SyncRequest.verify|verify} messages.
         * @function encode
         * @memberof collab.SyncRequest
         * @static
         * @param {collab.ISyncRequest} message SyncRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SyncRequest.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.lastMessageId != null && Object.hasOwnProperty.call(message, "lastMessageId"))
                $root.collab.Rid.encode(message.lastMessageId, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.stateVector != null && Object.hasOwnProperty.call(message, "stateVector"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.stateVector);
            return writer;
        };

        /**
         * Encodes the specified SyncRequest message, length delimited. Does not implicitly {@link collab.SyncRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof collab.SyncRequest
         * @static
         * @param {collab.ISyncRequest} message SyncRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SyncRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a SyncRequest message from the specified reader or buffer.
         * @function decode
         * @memberof collab.SyncRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {collab.SyncRequest} SyncRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SyncRequest.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            const end = length === undefined ? reader.len : reader.pos + length, message = new $root.collab.SyncRequest();

            while (reader.pos < end) {
                const tag = reader.uint32();

                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.lastMessageId = $root.collab.Rid.decode(reader, reader.uint32());
                        break;
                    }

                case 2: {
                        message.stateVector = reader.bytes();
                        break;
                    }

                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }

            return message;
        };

        /**
         * Decodes a SyncRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof collab.SyncRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {collab.SyncRequest} SyncRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SyncRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a SyncRequest message.
         * @function verify
         * @memberof collab.SyncRequest
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        SyncRequest.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.lastMessageId != null && message.hasOwnProperty("lastMessageId")) {
                const error = $root.collab.Rid.verify(message.lastMessageId);

                if (error)
                    return "lastMessageId." + error;
            }

            if (message.stateVector != null && message.hasOwnProperty("stateVector"))
                if (!(message.stateVector && typeof message.stateVector.length === "number" || $util.isString(message.stateVector)))
                    return "stateVector: buffer expected";
            return null;
        };

        /**
         * Creates a SyncRequest message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof collab.SyncRequest
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {collab.SyncRequest} SyncRequest
         */
        SyncRequest.fromObject = function fromObject(object) {
            if (object instanceof $root.collab.SyncRequest)
                return object;
            const message = new $root.collab.SyncRequest();

            if (object.lastMessageId != null) {
                if (typeof object.lastMessageId !== "object")
                    throw TypeError(".collab.SyncRequest.lastMessageId: object expected");
                message.lastMessageId = $root.collab.Rid.fromObject(object.lastMessageId);
            }

            if (object.stateVector != null)
                if (typeof object.stateVector === "string")
                    $util.base64.decode(object.stateVector, message.stateVector = $util.newBuffer($util.base64.length(object.stateVector)), 0);
                else if (object.stateVector.length >= 0)
                    message.stateVector = object.stateVector;
            return message;
        };

        /**
         * Creates a plain object from a SyncRequest message. Also converts values to other types if specified.
         * @function toObject
         * @memberof collab.SyncRequest
         * @static
         * @param {collab.SyncRequest} message SyncRequest
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        SyncRequest.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            const object = {};

            if (options.defaults) {
                object.lastMessageId = null;
                if (options.bytes === String)
                    object.stateVector = "";
                else {
                    object.stateVector = [];
                    if (options.bytes !== Array)
                        object.stateVector = $util.newBuffer(object.stateVector);
                }
            }

            if (message.lastMessageId != null && message.hasOwnProperty("lastMessageId"))
                object.lastMessageId = $root.collab.Rid.toObject(message.lastMessageId, options);
            if (message.stateVector != null && message.hasOwnProperty("stateVector"))
                object.stateVector = options.bytes === String ? $util.base64.encode(message.stateVector, 0, message.stateVector.length) : options.bytes === Array ? Array.prototype.slice.call(message.stateVector) : message.stateVector;
            return object;
        };

        /**
         * Converts this SyncRequest to JSON.
         * @function toJSON
         * @memberof collab.SyncRequest
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        SyncRequest.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for SyncRequest
         * @function getTypeUrl
         * @memberof collab.SyncRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        SyncRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }

            return typeUrlPrefix + "/collab.SyncRequest";
        };

        return SyncRequest;
    })();

    collab.Update = (function() {

        /**
         * Properties of an Update.
         * @memberof collab
         * @interface IUpdate
         * @property {collab.IRid|null} [messageId] Update messageId
         * @property {number|null} [flags] Update flags
         * @property {Uint8Array|null} [payload] Update payload
         */

        /**
         * Constructs a new Update.
         * @memberof collab
         * @classdesc Update message is send either in response to `SyncRequest` or independently by
         * the client/server. It contains the Yjs doc update that can represent incremental
         * changes made over corresponding collab, or full document state.
         * @implements IUpdate
         * @constructor
         * @param {collab.IUpdate=} [properties] Properties to set
         */
        function Update(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Update messageId.
         * @member {collab.IRid|null|undefined} messageId
         * @memberof collab.Update
         * @instance
         */
        Update.prototype.messageId = null;

        /**
         * Update flags.
         * @member {number} flags
         * @memberof collab.Update
         * @instance
         */
        Update.prototype.flags = 0;

        /**
         * Update payload.
         * @member {Uint8Array} payload
         * @memberof collab.Update
         * @instance
         */
        Update.prototype.payload = $util.newBuffer([]);

        /**
         * Creates a new Update instance using the specified properties.
         * @function create
         * @memberof collab.Update
         * @static
         * @param {collab.IUpdate=} [properties] Properties to set
         * @returns {collab.Update} Update instance
         */
        Update.create = function create(properties) {
            return new Update(properties);
        };

        /**
         * Encodes the specified Update message. Does not implicitly {@link collab.Update.verify|verify} messages.
         * @function encode
         * @memberof collab.Update
         * @static
         * @param {collab.IUpdate} message Update message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Update.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.messageId != null && Object.hasOwnProperty.call(message, "messageId"))
                $root.collab.Rid.encode(message.messageId, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.flags != null && Object.hasOwnProperty.call(message, "flags"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.flags);
            if (message.payload != null && Object.hasOwnProperty.call(message, "payload"))
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.payload);
            return writer;
        };

        /**
         * Encodes the specified Update message, length delimited. Does not implicitly {@link collab.Update.verify|verify} messages.
         * @function encodeDelimited
         * @memberof collab.Update
         * @static
         * @param {collab.IUpdate} message Update message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Update.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an Update message from the specified reader or buffer.
         * @function decode
         * @memberof collab.Update
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {collab.Update} Update
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Update.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            const end = length === undefined ? reader.len : reader.pos + length, message = new $root.collab.Update();

            while (reader.pos < end) {
                const tag = reader.uint32();

                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.messageId = $root.collab.Rid.decode(reader, reader.uint32());
                        break;
                    }

                case 2: {
                        message.flags = reader.uint32();
                        break;
                    }

                case 3: {
                        message.payload = reader.bytes();
                        break;
                    }

                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }

            return message;
        };

        /**
         * Decodes an Update message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof collab.Update
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {collab.Update} Update
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Update.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an Update message.
         * @function verify
         * @memberof collab.Update
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Update.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.messageId != null && message.hasOwnProperty("messageId")) {
                const error = $root.collab.Rid.verify(message.messageId);

                if (error)
                    return "messageId." + error;
            }

            if (message.flags != null && message.hasOwnProperty("flags"))
                if (!$util.isInteger(message.flags))
                    return "flags: integer expected";
            if (message.payload != null && message.hasOwnProperty("payload"))
                if (!(message.payload && typeof message.payload.length === "number" || $util.isString(message.payload)))
                    return "payload: buffer expected";
            return null;
        };

        /**
         * Creates an Update message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof collab.Update
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {collab.Update} Update
         */
        Update.fromObject = function fromObject(object) {
            if (object instanceof $root.collab.Update)
                return object;
            const message = new $root.collab.Update();

            if (object.messageId != null) {
                if (typeof object.messageId !== "object")
                    throw TypeError(".collab.Update.messageId: object expected");
                message.messageId = $root.collab.Rid.fromObject(object.messageId);
            }

            if (object.flags != null)
                message.flags = object.flags >>> 0;
            if (object.payload != null)
                if (typeof object.payload === "string")
                    $util.base64.decode(object.payload, message.payload = $util.newBuffer($util.base64.length(object.payload)), 0);
                else if (object.payload.length >= 0)
                    message.payload = object.payload;
            return message;
        };

        /**
         * Creates a plain object from an Update message. Also converts values to other types if specified.
         * @function toObject
         * @memberof collab.Update
         * @static
         * @param {collab.Update} message Update
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Update.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            const object = {};

            if (options.defaults) {
                object.messageId = null;
                object.flags = 0;
                if (options.bytes === String)
                    object.payload = "";
                else {
                    object.payload = [];
                    if (options.bytes !== Array)
                        object.payload = $util.newBuffer(object.payload);
                }
            }

            if (message.messageId != null && message.hasOwnProperty("messageId"))
                object.messageId = $root.collab.Rid.toObject(message.messageId, options);
            if (message.flags != null && message.hasOwnProperty("flags"))
                object.flags = message.flags;
            if (message.payload != null && message.hasOwnProperty("payload"))
                object.payload = options.bytes === String ? $util.base64.encode(message.payload, 0, message.payload.length) : options.bytes === Array ? Array.prototype.slice.call(message.payload) : message.payload;
            return object;
        };

        /**
         * Converts this Update to JSON.
         * @function toJSON
         * @memberof collab.Update
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Update.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Update
         * @function getTypeUrl
         * @memberof collab.Update
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Update.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }

            return typeUrlPrefix + "/collab.Update";
        };

        return Update;
    })();

    collab.AwarenessUpdate = (function() {

        /**
         * Properties of an AwarenessUpdate.
         * @memberof collab
         * @interface IAwarenessUpdate
         * @property {Uint8Array|null} [payload] AwarenessUpdate payload
         */

        /**
         * Constructs a new AwarenessUpdate.
         * @memberof collab
         * @classdesc AwarenessUpdate message is send to inform about the latest changes in the
         * Yjs doc awareness state.
         * @implements IAwarenessUpdate
         * @constructor
         * @param {collab.IAwarenessUpdate=} [properties] Properties to set
         */
        function AwarenessUpdate(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * AwarenessUpdate payload.
         * @member {Uint8Array} payload
         * @memberof collab.AwarenessUpdate
         * @instance
         */
        AwarenessUpdate.prototype.payload = $util.newBuffer([]);

        /**
         * Creates a new AwarenessUpdate instance using the specified properties.
         * @function create
         * @memberof collab.AwarenessUpdate
         * @static
         * @param {collab.IAwarenessUpdate=} [properties] Properties to set
         * @returns {collab.AwarenessUpdate} AwarenessUpdate instance
         */
        AwarenessUpdate.create = function create(properties) {
            return new AwarenessUpdate(properties);
        };

        /**
         * Encodes the specified AwarenessUpdate message. Does not implicitly {@link collab.AwarenessUpdate.verify|verify} messages.
         * @function encode
         * @memberof collab.AwarenessUpdate
         * @static
         * @param {collab.IAwarenessUpdate} message AwarenessUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        AwarenessUpdate.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.payload != null && Object.hasOwnProperty.call(message, "payload"))
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.payload);
            return writer;
        };

        /**
         * Encodes the specified AwarenessUpdate message, length delimited. Does not implicitly {@link collab.AwarenessUpdate.verify|verify} messages.
         * @function encodeDelimited
         * @memberof collab.AwarenessUpdate
         * @static
         * @param {collab.IAwarenessUpdate} message AwarenessUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        AwarenessUpdate.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an AwarenessUpdate message from the specified reader or buffer.
         * @function decode
         * @memberof collab.AwarenessUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {collab.AwarenessUpdate} AwarenessUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        AwarenessUpdate.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            const end = length === undefined ? reader.len : reader.pos + length, message = new $root.collab.AwarenessUpdate();

            while (reader.pos < end) {
                const tag = reader.uint32();

                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.payload = reader.bytes();
                        break;
                    }

                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }

            return message;
        };

        /**
         * Decodes an AwarenessUpdate message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof collab.AwarenessUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {collab.AwarenessUpdate} AwarenessUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        AwarenessUpdate.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an AwarenessUpdate message.
         * @function verify
         * @memberof collab.AwarenessUpdate
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        AwarenessUpdate.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.payload != null && message.hasOwnProperty("payload"))
                if (!(message.payload && typeof message.payload.length === "number" || $util.isString(message.payload)))
                    return "payload: buffer expected";
            return null;
        };

        /**
         * Creates an AwarenessUpdate message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof collab.AwarenessUpdate
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {collab.AwarenessUpdate} AwarenessUpdate
         */
        AwarenessUpdate.fromObject = function fromObject(object) {
            if (object instanceof $root.collab.AwarenessUpdate)
                return object;
            const message = new $root.collab.AwarenessUpdate();

            if (object.payload != null)
                if (typeof object.payload === "string")
                    $util.base64.decode(object.payload, message.payload = $util.newBuffer($util.base64.length(object.payload)), 0);
                else if (object.payload.length >= 0)
                    message.payload = object.payload;
            return message;
        };

        /**
         * Creates a plain object from an AwarenessUpdate message. Also converts values to other types if specified.
         * @function toObject
         * @memberof collab.AwarenessUpdate
         * @static
         * @param {collab.AwarenessUpdate} message AwarenessUpdate
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        AwarenessUpdate.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            const object = {};

            if (options.defaults)
                if (options.bytes === String)
                    object.payload = "";
                else {
                    object.payload = [];
                    if (options.bytes !== Array)
                        object.payload = $util.newBuffer(object.payload);
                }

            if (message.payload != null && message.hasOwnProperty("payload"))
                object.payload = options.bytes === String ? $util.base64.encode(message.payload, 0, message.payload.length) : options.bytes === Array ? Array.prototype.slice.call(message.payload) : message.payload;
            return object;
        };

        /**
         * Converts this AwarenessUpdate to JSON.
         * @function toJSON
         * @memberof collab.AwarenessUpdate
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        AwarenessUpdate.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for AwarenessUpdate
         * @function getTypeUrl
         * @memberof collab.AwarenessUpdate
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        AwarenessUpdate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }

            return typeUrlPrefix + "/collab.AwarenessUpdate";
        };

        return AwarenessUpdate;
    })();

    collab.AccessChanged = (function() {

        /**
         * Properties of an AccessChanged.
         * @memberof collab
         * @interface IAccessChanged
         * @property {boolean|null} [canRead] AccessChanged canRead
         * @property {boolean|null} [canWrite] AccessChanged canWrite
         * @property {number|null} [reason] AccessChanged reason
         */

        /**
         * Constructs a new AccessChanged.
         * @memberof collab
         * @classdesc AccessChanged message is sent only by the server when we recognise, that
         * connected client has lost the access to a corresponding collab.
         * @implements IAccessChanged
         * @constructor
         * @param {collab.IAccessChanged=} [properties] Properties to set
         */
        function AccessChanged(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * AccessChanged canRead.
         * @member {boolean} canRead
         * @memberof collab.AccessChanged
         * @instance
         */
        AccessChanged.prototype.canRead = false;

        /**
         * AccessChanged canWrite.
         * @member {boolean} canWrite
         * @memberof collab.AccessChanged
         * @instance
         */
        AccessChanged.prototype.canWrite = false;

        /**
         * AccessChanged reason.
         * @member {number} reason
         * @memberof collab.AccessChanged
         * @instance
         */
        AccessChanged.prototype.reason = 0;

        /**
         * Creates a new AccessChanged instance using the specified properties.
         * @function create
         * @memberof collab.AccessChanged
         * @static
         * @param {collab.IAccessChanged=} [properties] Properties to set
         * @returns {collab.AccessChanged} AccessChanged instance
         */
        AccessChanged.create = function create(properties) {
            return new AccessChanged(properties);
        };

        /**
         * Encodes the specified AccessChanged message. Does not implicitly {@link collab.AccessChanged.verify|verify} messages.
         * @function encode
         * @memberof collab.AccessChanged
         * @static
         * @param {collab.IAccessChanged} message AccessChanged message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        AccessChanged.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.canRead != null && Object.hasOwnProperty.call(message, "canRead"))
                writer.uint32(/* id 1, wireType 0 =*/8).bool(message.canRead);
            if (message.canWrite != null && Object.hasOwnProperty.call(message, "canWrite"))
                writer.uint32(/* id 2, wireType 0 =*/16).bool(message.canWrite);
            if (message.reason != null && Object.hasOwnProperty.call(message, "reason"))
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.reason);
            return writer;
        };

        /**
         * Encodes the specified AccessChanged message, length delimited. Does not implicitly {@link collab.AccessChanged.verify|verify} messages.
         * @function encodeDelimited
         * @memberof collab.AccessChanged
         * @static
         * @param {collab.IAccessChanged} message AccessChanged message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        AccessChanged.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an AccessChanged message from the specified reader or buffer.
         * @function decode
         * @memberof collab.AccessChanged
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {collab.AccessChanged} AccessChanged
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        AccessChanged.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            const end = length === undefined ? reader.len : reader.pos + length, message = new $root.collab.AccessChanged();

            while (reader.pos < end) {
                const tag = reader.uint32();

                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.canRead = reader.bool();
                        break;
                    }

                case 2: {
                        message.canWrite = reader.bool();
                        break;
                    }

                case 3: {
                        message.reason = reader.int32();
                        break;
                    }

                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }

            return message;
        };

        /**
         * Decodes an AccessChanged message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof collab.AccessChanged
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {collab.AccessChanged} AccessChanged
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        AccessChanged.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an AccessChanged message.
         * @function verify
         * @memberof collab.AccessChanged
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        AccessChanged.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.canRead != null && message.hasOwnProperty("canRead"))
                if (typeof message.canRead !== "boolean")
                    return "canRead: boolean expected";
            if (message.canWrite != null && message.hasOwnProperty("canWrite"))
                if (typeof message.canWrite !== "boolean")
                    return "canWrite: boolean expected";
            if (message.reason != null && message.hasOwnProperty("reason"))
                if (!$util.isInteger(message.reason))
                    return "reason: integer expected";
            return null;
        };

        /**
         * Creates an AccessChanged message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof collab.AccessChanged
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {collab.AccessChanged} AccessChanged
         */
        AccessChanged.fromObject = function fromObject(object) {
            if (object instanceof $root.collab.AccessChanged)
                return object;
            const message = new $root.collab.AccessChanged();

            if (object.canRead != null)
                message.canRead = Boolean(object.canRead);
            if (object.canWrite != null)
                message.canWrite = Boolean(object.canWrite);
            if (object.reason != null)
                message.reason = object.reason | 0;
            return message;
        };

        /**
         * Creates a plain object from an AccessChanged message. Also converts values to other types if specified.
         * @function toObject
         * @memberof collab.AccessChanged
         * @static
         * @param {collab.AccessChanged} message AccessChanged
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        AccessChanged.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            const object = {};

            if (options.defaults) {
                object.canRead = false;
                object.canWrite = false;
                object.reason = 0;
            }

            if (message.canRead != null && message.hasOwnProperty("canRead"))
                object.canRead = message.canRead;
            if (message.canWrite != null && message.hasOwnProperty("canWrite"))
                object.canWrite = message.canWrite;
            if (message.reason != null && message.hasOwnProperty("reason"))
                object.reason = message.reason;
            return object;
        };

        /**
         * Converts this AccessChanged to JSON.
         * @function toJSON
         * @memberof collab.AccessChanged
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        AccessChanged.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for AccessChanged
         * @function getTypeUrl
         * @memberof collab.AccessChanged
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        AccessChanged.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }

            return typeUrlPrefix + "/collab.AccessChanged";
        };

        return AccessChanged;
    })();

    collab.CollabMessage = (function() {

        /**
         * Properties of a CollabMessage.
         * @memberof collab
         * @interface ICollabMessage
         * @property {string|null} [objectId] CollabMessage objectId
         * @property {number|null} [collabType] CollabMessage collabType
         * @property {collab.ISyncRequest|null} [syncRequest] CollabMessage syncRequest
         * @property {collab.IUpdate|null} [update] CollabMessage update
         * @property {collab.IAwarenessUpdate|null} [awarenessUpdate] CollabMessage awarenessUpdate
         * @property {collab.IAccessChanged|null} [accessChanged] CollabMessage accessChanged
         */

        /**
         * Constructs a new CollabMessage.
         * @memberof collab
         * @classdesc Represents a CollabMessage.
         * @implements ICollabMessage
         * @constructor
         * @param {collab.ICollabMessage=} [properties] Properties to set
         */
        function CollabMessage(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * CollabMessage objectId.
         * @member {string} objectId
         * @memberof collab.CollabMessage
         * @instance
         */
        CollabMessage.prototype.objectId = "";

        /**
         * CollabMessage collabType.
         * @member {number} collabType
         * @memberof collab.CollabMessage
         * @instance
         */
        CollabMessage.prototype.collabType = 0;

        /**
         * CollabMessage syncRequest.
         * @member {collab.ISyncRequest|null|undefined} syncRequest
         * @memberof collab.CollabMessage
         * @instance
         */
        CollabMessage.prototype.syncRequest = null;

        /**
         * CollabMessage update.
         * @member {collab.IUpdate|null|undefined} update
         * @memberof collab.CollabMessage
         * @instance
         */
        CollabMessage.prototype.update = null;

        /**
         * CollabMessage awarenessUpdate.
         * @member {collab.IAwarenessUpdate|null|undefined} awarenessUpdate
         * @memberof collab.CollabMessage
         * @instance
         */
        CollabMessage.prototype.awarenessUpdate = null;

        /**
         * CollabMessage accessChanged.
         * @member {collab.IAccessChanged|null|undefined} accessChanged
         * @memberof collab.CollabMessage
         * @instance
         */
        CollabMessage.prototype.accessChanged = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        /**
         * CollabMessage data.
         * @member {"syncRequest"|"update"|"awarenessUpdate"|"accessChanged"|undefined} data
         * @memberof collab.CollabMessage
         * @instance
         */
        Object.defineProperty(CollabMessage.prototype, "data", {
            get: $util.oneOfGetter($oneOfFields = ["syncRequest", "update", "awarenessUpdate", "accessChanged"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new CollabMessage instance using the specified properties.
         * @function create
         * @memberof collab.CollabMessage
         * @static
         * @param {collab.ICollabMessage=} [properties] Properties to set
         * @returns {collab.CollabMessage} CollabMessage instance
         */
        CollabMessage.create = function create(properties) {
            return new CollabMessage(properties);
        };

        /**
         * Encodes the specified CollabMessage message. Does not implicitly {@link collab.CollabMessage.verify|verify} messages.
         * @function encode
         * @memberof collab.CollabMessage
         * @static
         * @param {collab.ICollabMessage} message CollabMessage message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CollabMessage.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.objectId != null && Object.hasOwnProperty.call(message, "objectId"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.objectId);
            if (message.collabType != null && Object.hasOwnProperty.call(message, "collabType"))
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.collabType);
            if (message.syncRequest != null && Object.hasOwnProperty.call(message, "syncRequest"))
                $root.collab.SyncRequest.encode(message.syncRequest, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            if (message.update != null && Object.hasOwnProperty.call(message, "update"))
                $root.collab.Update.encode(message.update, writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
            if (message.awarenessUpdate != null && Object.hasOwnProperty.call(message, "awarenessUpdate"))
                $root.collab.AwarenessUpdate.encode(message.awarenessUpdate, writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
            if (message.accessChanged != null && Object.hasOwnProperty.call(message, "accessChanged"))
                $root.collab.AccessChanged.encode(message.accessChanged, writer.uint32(/* id 6, wireType 2 =*/50).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified CollabMessage message, length delimited. Does not implicitly {@link collab.CollabMessage.verify|verify} messages.
         * @function encodeDelimited
         * @memberof collab.CollabMessage
         * @static
         * @param {collab.ICollabMessage} message CollabMessage message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CollabMessage.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a CollabMessage message from the specified reader or buffer.
         * @function decode
         * @memberof collab.CollabMessage
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {collab.CollabMessage} CollabMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CollabMessage.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            const end = length === undefined ? reader.len : reader.pos + length, message = new $root.collab.CollabMessage();

            while (reader.pos < end) {
                const tag = reader.uint32();

                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.objectId = reader.string();
                        break;
                    }

                case 2: {
                        message.collabType = reader.int32();
                        break;
                    }

                case 3: {
                        message.syncRequest = $root.collab.SyncRequest.decode(reader, reader.uint32());
                        break;
                    }

                case 4: {
                        message.update = $root.collab.Update.decode(reader, reader.uint32());
                        break;
                    }

                case 5: {
                        message.awarenessUpdate = $root.collab.AwarenessUpdate.decode(reader, reader.uint32());
                        break;
                    }

                case 6: {
                        message.accessChanged = $root.collab.AccessChanged.decode(reader, reader.uint32());
                        break;
                    }

                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }

            return message;
        };

        /**
         * Decodes a CollabMessage message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof collab.CollabMessage
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {collab.CollabMessage} CollabMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CollabMessage.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a CollabMessage message.
         * @function verify
         * @memberof collab.CollabMessage
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        CollabMessage.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            const properties = {};

            if (message.objectId != null && message.hasOwnProperty("objectId"))
                if (!$util.isString(message.objectId))
                    return "objectId: string expected";
            if (message.collabType != null && message.hasOwnProperty("collabType"))
                if (!$util.isInteger(message.collabType))
                    return "collabType: integer expected";
            if (message.syncRequest != null && message.hasOwnProperty("syncRequest")) {
                properties.data = 1;
                {
                    const error = $root.collab.SyncRequest.verify(message.syncRequest);

                    if (error)
                        return "syncRequest." + error;
                }
            }

            if (message.update != null && message.hasOwnProperty("update")) {
                if (properties.data === 1)
                    return "data: multiple values";
                properties.data = 1;
                {
                    const error = $root.collab.Update.verify(message.update);

                    if (error)
                        return "update." + error;
                }
            }

            if (message.awarenessUpdate != null && message.hasOwnProperty("awarenessUpdate")) {
                if (properties.data === 1)
                    return "data: multiple values";
                properties.data = 1;
                {
                    const error = $root.collab.AwarenessUpdate.verify(message.awarenessUpdate);

                    if (error)
                        return "awarenessUpdate." + error;
                }
            }

            if (message.accessChanged != null && message.hasOwnProperty("accessChanged")) {
                if (properties.data === 1)
                    return "data: multiple values";
                properties.data = 1;
                {
                    const error = $root.collab.AccessChanged.verify(message.accessChanged);

                    if (error)
                        return "accessChanged." + error;
                }
            }

            return null;
        };

        /**
         * Creates a CollabMessage message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof collab.CollabMessage
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {collab.CollabMessage} CollabMessage
         */
        CollabMessage.fromObject = function fromObject(object) {
            if (object instanceof $root.collab.CollabMessage)
                return object;
            const message = new $root.collab.CollabMessage();

            if (object.objectId != null)
                message.objectId = String(object.objectId);
            if (object.collabType != null)
                message.collabType = object.collabType | 0;
            if (object.syncRequest != null) {
                if (typeof object.syncRequest !== "object")
                    throw TypeError(".collab.CollabMessage.syncRequest: object expected");
                message.syncRequest = $root.collab.SyncRequest.fromObject(object.syncRequest);
            }

            if (object.update != null) {
                if (typeof object.update !== "object")
                    throw TypeError(".collab.CollabMessage.update: object expected");
                message.update = $root.collab.Update.fromObject(object.update);
            }

            if (object.awarenessUpdate != null) {
                if (typeof object.awarenessUpdate !== "object")
                    throw TypeError(".collab.CollabMessage.awarenessUpdate: object expected");
                message.awarenessUpdate = $root.collab.AwarenessUpdate.fromObject(object.awarenessUpdate);
            }

            if (object.accessChanged != null) {
                if (typeof object.accessChanged !== "object")
                    throw TypeError(".collab.CollabMessage.accessChanged: object expected");
                message.accessChanged = $root.collab.AccessChanged.fromObject(object.accessChanged);
            }

            return message;
        };

        /**
         * Creates a plain object from a CollabMessage message. Also converts values to other types if specified.
         * @function toObject
         * @memberof collab.CollabMessage
         * @static
         * @param {collab.CollabMessage} message CollabMessage
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        CollabMessage.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            const object = {};

            if (options.defaults) {
                object.objectId = "";
                object.collabType = 0;
            }

            if (message.objectId != null && message.hasOwnProperty("objectId"))
                object.objectId = message.objectId;
            if (message.collabType != null && message.hasOwnProperty("collabType"))
                object.collabType = message.collabType;
            if (message.syncRequest != null && message.hasOwnProperty("syncRequest")) {
                object.syncRequest = $root.collab.SyncRequest.toObject(message.syncRequest, options);
                if (options.oneofs)
                    object.data = "syncRequest";
            }

            if (message.update != null && message.hasOwnProperty("update")) {
                object.update = $root.collab.Update.toObject(message.update, options);
                if (options.oneofs)
                    object.data = "update";
            }

            if (message.awarenessUpdate != null && message.hasOwnProperty("awarenessUpdate")) {
                object.awarenessUpdate = $root.collab.AwarenessUpdate.toObject(message.awarenessUpdate, options);
                if (options.oneofs)
                    object.data = "awarenessUpdate";
            }

            if (message.accessChanged != null && message.hasOwnProperty("accessChanged")) {
                object.accessChanged = $root.collab.AccessChanged.toObject(message.accessChanged, options);
                if (options.oneofs)
                    object.data = "accessChanged";
            }

            return object;
        };

        /**
         * Converts this CollabMessage to JSON.
         * @function toJSON
         * @memberof collab.CollabMessage
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        CollabMessage.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for CollabMessage
         * @function getTypeUrl
         * @memberof collab.CollabMessage
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        CollabMessage.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }

            return typeUrlPrefix + "/collab.CollabMessage";
        };

        return CollabMessage;
    })();

    return collab;
})();

export const notification = $root.notification = (() => {

    /**
     * Namespace notification.
     * @exports notification
     * @namespace
     */
    const notification = {};

    notification.WorkspaceNotification = (function() {

        /**
         * Properties of a WorkspaceNotification.
         * @memberof notification
         * @interface IWorkspaceNotification
         * @property {notification.IUserProfileChange|null} [profileChange] WorkspaceNotification profileChange
         * @property {notification.IPermissionChanged|null} [permissionChanged] WorkspaceNotification permissionChanged
         */

        /**
         * Constructs a new WorkspaceNotification.
         * @memberof notification
         * @classdesc Represents a WorkspaceNotification.
         * @implements IWorkspaceNotification
         * @constructor
         * @param {notification.IWorkspaceNotification=} [properties] Properties to set
         */
        function WorkspaceNotification(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * WorkspaceNotification profileChange.
         * @member {notification.IUserProfileChange|null|undefined} profileChange
         * @memberof notification.WorkspaceNotification
         * @instance
         */
        WorkspaceNotification.prototype.profileChange = null;

        /**
         * WorkspaceNotification permissionChanged.
         * @member {notification.IPermissionChanged|null|undefined} permissionChanged
         * @memberof notification.WorkspaceNotification
         * @instance
         */
        WorkspaceNotification.prototype.permissionChanged = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        /**
         * WorkspaceNotification payload.
         * @member {"profileChange"|"permissionChanged"|undefined} payload
         * @memberof notification.WorkspaceNotification
         * @instance
         */
        Object.defineProperty(WorkspaceNotification.prototype, "payload", {
            get: $util.oneOfGetter($oneOfFields = ["profileChange", "permissionChanged"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new WorkspaceNotification instance using the specified properties.
         * @function create
         * @memberof notification.WorkspaceNotification
         * @static
         * @param {notification.IWorkspaceNotification=} [properties] Properties to set
         * @returns {notification.WorkspaceNotification} WorkspaceNotification instance
         */
        WorkspaceNotification.create = function create(properties) {
            return new WorkspaceNotification(properties);
        };

        /**
         * Encodes the specified WorkspaceNotification message. Does not implicitly {@link notification.WorkspaceNotification.verify|verify} messages.
         * @function encode
         * @memberof notification.WorkspaceNotification
         * @static
         * @param {notification.IWorkspaceNotification} message WorkspaceNotification message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        WorkspaceNotification.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.profileChange != null && Object.hasOwnProperty.call(message, "profileChange"))
                $root.notification.UserProfileChange.encode(message.profileChange, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.permissionChanged != null && Object.hasOwnProperty.call(message, "permissionChanged"))
                $root.notification.PermissionChanged.encode(message.permissionChanged, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified WorkspaceNotification message, length delimited. Does not implicitly {@link notification.WorkspaceNotification.verify|verify} messages.
         * @function encodeDelimited
         * @memberof notification.WorkspaceNotification
         * @static
         * @param {notification.IWorkspaceNotification} message WorkspaceNotification message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        WorkspaceNotification.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a WorkspaceNotification message from the specified reader or buffer.
         * @function decode
         * @memberof notification.WorkspaceNotification
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {notification.WorkspaceNotification} WorkspaceNotification
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        WorkspaceNotification.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            const end = length === undefined ? reader.len : reader.pos + length, message = new $root.notification.WorkspaceNotification();

            while (reader.pos < end) {
                const tag = reader.uint32();

                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.profileChange = $root.notification.UserProfileChange.decode(reader, reader.uint32());
                        break;
                    }

                case 2: {
                        message.permissionChanged = $root.notification.PermissionChanged.decode(reader, reader.uint32());
                        break;
                    }

                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }

            return message;
        };

        /**
         * Decodes a WorkspaceNotification message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof notification.WorkspaceNotification
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {notification.WorkspaceNotification} WorkspaceNotification
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        WorkspaceNotification.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a WorkspaceNotification message.
         * @function verify
         * @memberof notification.WorkspaceNotification
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        WorkspaceNotification.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            const properties = {};

            if (message.profileChange != null && message.hasOwnProperty("profileChange")) {
                properties.payload = 1;
                {
                    const error = $root.notification.UserProfileChange.verify(message.profileChange);

                    if (error)
                        return "profileChange." + error;
                }
            }

            if (message.permissionChanged != null && message.hasOwnProperty("permissionChanged")) {
                if (properties.payload === 1)
                    return "payload: multiple values";
                properties.payload = 1;
                {
                    const error = $root.notification.PermissionChanged.verify(message.permissionChanged);

                    if (error)
                        return "permissionChanged." + error;
                }
            }

            return null;
        };

        /**
         * Creates a WorkspaceNotification message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof notification.WorkspaceNotification
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {notification.WorkspaceNotification} WorkspaceNotification
         */
        WorkspaceNotification.fromObject = function fromObject(object) {
            if (object instanceof $root.notification.WorkspaceNotification)
                return object;
            const message = new $root.notification.WorkspaceNotification();

            if (object.profileChange != null) {
                if (typeof object.profileChange !== "object")
                    throw TypeError(".notification.WorkspaceNotification.profileChange: object expected");
                message.profileChange = $root.notification.UserProfileChange.fromObject(object.profileChange);
            }

            if (object.permissionChanged != null) {
                if (typeof object.permissionChanged !== "object")
                    throw TypeError(".notification.WorkspaceNotification.permissionChanged: object expected");
                message.permissionChanged = $root.notification.PermissionChanged.fromObject(object.permissionChanged);
            }

            return message;
        };

        /**
         * Creates a plain object from a WorkspaceNotification message. Also converts values to other types if specified.
         * @function toObject
         * @memberof notification.WorkspaceNotification
         * @static
         * @param {notification.WorkspaceNotification} message WorkspaceNotification
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        WorkspaceNotification.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            const object = {};

            if (message.profileChange != null && message.hasOwnProperty("profileChange")) {
                object.profileChange = $root.notification.UserProfileChange.toObject(message.profileChange, options);
                if (options.oneofs)
                    object.payload = "profileChange";
            }

            if (message.permissionChanged != null && message.hasOwnProperty("permissionChanged")) {
                object.permissionChanged = $root.notification.PermissionChanged.toObject(message.permissionChanged, options);
                if (options.oneofs)
                    object.payload = "permissionChanged";
            }

            return object;
        };

        /**
         * Converts this WorkspaceNotification to JSON.
         * @function toJSON
         * @memberof notification.WorkspaceNotification
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        WorkspaceNotification.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for WorkspaceNotification
         * @function getTypeUrl
         * @memberof notification.WorkspaceNotification
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        WorkspaceNotification.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }

            return typeUrlPrefix + "/notification.WorkspaceNotification";
        };

        return WorkspaceNotification;
    })();

    notification.UserProfileChange = (function() {

        /**
         * Properties of a UserProfileChange.
         * @memberof notification
         * @interface IUserProfileChange
         * @property {number|Long|null} [uid] UserProfileChange uid
         * @property {string|null} [name] UserProfileChange name
         * @property {string|null} [email] UserProfileChange email
         */

        /**
         * Constructs a new UserProfileChange.
         * @memberof notification
         * @classdesc Represents a UserProfileChange.
         * @implements IUserProfileChange
         * @constructor
         * @param {notification.IUserProfileChange=} [properties] Properties to set
         */
        function UserProfileChange(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * UserProfileChange uid.
         * @member {number|Long} uid
         * @memberof notification.UserProfileChange
         * @instance
         */
        UserProfileChange.prototype.uid = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

        /**
         * UserProfileChange name.
         * @member {string|null|undefined} name
         * @memberof notification.UserProfileChange
         * @instance
         */
        UserProfileChange.prototype.name = null;

        /**
         * UserProfileChange email.
         * @member {string|null|undefined} email
         * @memberof notification.UserProfileChange
         * @instance
         */
        UserProfileChange.prototype.email = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        /**
         * UserProfileChange _name.
         * @member {"name"|undefined} _name
         * @memberof notification.UserProfileChange
         * @instance
         */
        Object.defineProperty(UserProfileChange.prototype, "_name", {
            get: $util.oneOfGetter($oneOfFields = ["name"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * UserProfileChange _email.
         * @member {"email"|undefined} _email
         * @memberof notification.UserProfileChange
         * @instance
         */
        Object.defineProperty(UserProfileChange.prototype, "_email", {
            get: $util.oneOfGetter($oneOfFields = ["email"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new UserProfileChange instance using the specified properties.
         * @function create
         * @memberof notification.UserProfileChange
         * @static
         * @param {notification.IUserProfileChange=} [properties] Properties to set
         * @returns {notification.UserProfileChange} UserProfileChange instance
         */
        UserProfileChange.create = function create(properties) {
            return new UserProfileChange(properties);
        };

        /**
         * Encodes the specified UserProfileChange message. Does not implicitly {@link notification.UserProfileChange.verify|verify} messages.
         * @function encode
         * @memberof notification.UserProfileChange
         * @static
         * @param {notification.IUserProfileChange} message UserProfileChange message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        UserProfileChange.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.uid != null && Object.hasOwnProperty.call(message, "uid"))
                writer.uint32(/* id 1, wireType 0 =*/8).int64(message.uid);
            if (message.name != null && Object.hasOwnProperty.call(message, "name"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.name);
            if (message.email != null && Object.hasOwnProperty.call(message, "email"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.email);
            return writer;
        };

        /**
         * Encodes the specified UserProfileChange message, length delimited. Does not implicitly {@link notification.UserProfileChange.verify|verify} messages.
         * @function encodeDelimited
         * @memberof notification.UserProfileChange
         * @static
         * @param {notification.IUserProfileChange} message UserProfileChange message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        UserProfileChange.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a UserProfileChange message from the specified reader or buffer.
         * @function decode
         * @memberof notification.UserProfileChange
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {notification.UserProfileChange} UserProfileChange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        UserProfileChange.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            const end = length === undefined ? reader.len : reader.pos + length, message = new $root.notification.UserProfileChange();

            while (reader.pos < end) {
                const tag = reader.uint32();

                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.uid = reader.int64();
                        break;
                    }

                case 2: {
                        message.name = reader.string();
                        break;
                    }

                case 3: {
                        message.email = reader.string();
                        break;
                    }

                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }

            return message;
        };

        /**
         * Decodes a UserProfileChange message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof notification.UserProfileChange
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {notification.UserProfileChange} UserProfileChange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        UserProfileChange.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a UserProfileChange message.
         * @function verify
         * @memberof notification.UserProfileChange
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        UserProfileChange.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            const properties = {};

            if (message.uid != null && message.hasOwnProperty("uid"))
                if (!$util.isInteger(message.uid) && !(message.uid && $util.isInteger(message.uid.low) && $util.isInteger(message.uid.high)))
                    return "uid: integer|Long expected";
            if (message.name != null && message.hasOwnProperty("name")) {
                properties._name = 1;
                if (!$util.isString(message.name))
                    return "name: string expected";
            }

            if (message.email != null && message.hasOwnProperty("email")) {
                properties._email = 1;
                if (!$util.isString(message.email))
                    return "email: string expected";
            }

            return null;
        };

        /**
         * Creates a UserProfileChange message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof notification.UserProfileChange
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {notification.UserProfileChange} UserProfileChange
         */
        UserProfileChange.fromObject = function fromObject(object) {
            if (object instanceof $root.notification.UserProfileChange)
                return object;
            const message = new $root.notification.UserProfileChange();

            if (object.uid != null)
                if ($util.Long)
                    (message.uid = $util.Long.fromValue(object.uid)).unsigned = false;
                else if (typeof object.uid === "string")
                    message.uid = parseInt(object.uid, 10);
                else if (typeof object.uid === "number")
                    message.uid = object.uid;
                else if (typeof object.uid === "object")
                    message.uid = new $util.LongBits(object.uid.low >>> 0, object.uid.high >>> 0).toNumber();
            if (object.name != null)
                message.name = String(object.name);
            if (object.email != null)
                message.email = String(object.email);
            return message;
        };

        /**
         * Creates a plain object from a UserProfileChange message. Also converts values to other types if specified.
         * @function toObject
         * @memberof notification.UserProfileChange
         * @static
         * @param {notification.UserProfileChange} message UserProfileChange
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        UserProfileChange.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            const object = {};

            if (options.defaults)
                if ($util.Long) {
                    const long = new $util.Long(0, 0, false);

                    object.uid = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.uid = options.longs === String ? "0" : 0;
            if (message.uid != null && message.hasOwnProperty("uid"))
                if (typeof message.uid === "number")
                    object.uid = options.longs === String ? String(message.uid) : message.uid;
                else
                    object.uid = options.longs === String ? $util.Long.prototype.toString.call(message.uid) : options.longs === Number ? new $util.LongBits(message.uid.low >>> 0, message.uid.high >>> 0).toNumber() : message.uid;
            if (message.name != null && message.hasOwnProperty("name")) {
                object.name = message.name;
                if (options.oneofs)
                    object._name = "name";
            }

            if (message.email != null && message.hasOwnProperty("email")) {
                object.email = message.email;
                if (options.oneofs)
                    object._email = "email";
            }

            return object;
        };

        /**
         * Converts this UserProfileChange to JSON.
         * @function toJSON
         * @memberof notification.UserProfileChange
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        UserProfileChange.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for UserProfileChange
         * @function getTypeUrl
         * @memberof notification.UserProfileChange
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        UserProfileChange.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }

            return typeUrlPrefix + "/notification.UserProfileChange";
        };

        return UserProfileChange;
    })();

    notification.PermissionChanged = (function() {

        /**
         * Properties of a PermissionChanged.
         * @memberof notification
         * @interface IPermissionChanged
         * @property {string|null} [objectId] PermissionChanged objectId
         * @property {number|null} [reason] PermissionChanged reason
         */

        /**
         * Constructs a new PermissionChanged.
         * @memberof notification
         * @classdesc Represents a PermissionChanged.
         * @implements IPermissionChanged
         * @constructor
         * @param {notification.IPermissionChanged=} [properties] Properties to set
         */
        function PermissionChanged(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PermissionChanged objectId.
         * @member {string} objectId
         * @memberof notification.PermissionChanged
         * @instance
         */
        PermissionChanged.prototype.objectId = "";

        /**
         * PermissionChanged reason.
         * @member {number} reason
         * @memberof notification.PermissionChanged
         * @instance
         */
        PermissionChanged.prototype.reason = 0;

        /**
         * Creates a new PermissionChanged instance using the specified properties.
         * @function create
         * @memberof notification.PermissionChanged
         * @static
         * @param {notification.IPermissionChanged=} [properties] Properties to set
         * @returns {notification.PermissionChanged} PermissionChanged instance
         */
        PermissionChanged.create = function create(properties) {
            return new PermissionChanged(properties);
        };

        /**
         * Encodes the specified PermissionChanged message. Does not implicitly {@link notification.PermissionChanged.verify|verify} messages.
         * @function encode
         * @memberof notification.PermissionChanged
         * @static
         * @param {notification.IPermissionChanged} message PermissionChanged message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PermissionChanged.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.objectId != null && Object.hasOwnProperty.call(message, "objectId"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.objectId);
            if (message.reason != null && Object.hasOwnProperty.call(message, "reason"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.reason);
            return writer;
        };

        /**
         * Encodes the specified PermissionChanged message, length delimited. Does not implicitly {@link notification.PermissionChanged.verify|verify} messages.
         * @function encodeDelimited
         * @memberof notification.PermissionChanged
         * @static
         * @param {notification.IPermissionChanged} message PermissionChanged message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PermissionChanged.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a PermissionChanged message from the specified reader or buffer.
         * @function decode
         * @memberof notification.PermissionChanged
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {notification.PermissionChanged} PermissionChanged
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PermissionChanged.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            const end = length === undefined ? reader.len : reader.pos + length, message = new $root.notification.PermissionChanged();

            while (reader.pos < end) {
                const tag = reader.uint32();

                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.objectId = reader.string();
                        break;
                    }

                case 2: {
                        message.reason = reader.uint32();
                        break;
                    }

                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }

            return message;
        };

        /**
         * Decodes a PermissionChanged message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof notification.PermissionChanged
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {notification.PermissionChanged} PermissionChanged
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PermissionChanged.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a PermissionChanged message.
         * @function verify
         * @memberof notification.PermissionChanged
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        PermissionChanged.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.objectId != null && message.hasOwnProperty("objectId"))
                if (!$util.isString(message.objectId))
                    return "objectId: string expected";
            if (message.reason != null && message.hasOwnProperty("reason"))
                if (!$util.isInteger(message.reason))
                    return "reason: integer expected";
            return null;
        };

        /**
         * Creates a PermissionChanged message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof notification.PermissionChanged
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {notification.PermissionChanged} PermissionChanged
         */
        PermissionChanged.fromObject = function fromObject(object) {
            if (object instanceof $root.notification.PermissionChanged)
                return object;
            const message = new $root.notification.PermissionChanged();

            if (object.objectId != null)
                message.objectId = String(object.objectId);
            if (object.reason != null)
                message.reason = object.reason >>> 0;
            return message;
        };

        /**
         * Creates a plain object from a PermissionChanged message. Also converts values to other types if specified.
         * @function toObject
         * @memberof notification.PermissionChanged
         * @static
         * @param {notification.PermissionChanged} message PermissionChanged
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        PermissionChanged.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            const object = {};

            if (options.defaults) {
                object.objectId = "";
                object.reason = 0;
            }

            if (message.objectId != null && message.hasOwnProperty("objectId"))
                object.objectId = message.objectId;
            if (message.reason != null && message.hasOwnProperty("reason"))
                object.reason = message.reason;
            return object;
        };

        /**
         * Converts this PermissionChanged to JSON.
         * @function toJSON
         * @memberof notification.PermissionChanged
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        PermissionChanged.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for PermissionChanged
         * @function getTypeUrl
         * @memberof notification.PermissionChanged
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PermissionChanged.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }

            return typeUrlPrefix + "/notification.PermissionChanged";
        };

        return PermissionChanged;
    })();

    return notification;
})();

export { $root as default };
