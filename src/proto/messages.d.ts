import * as $protobuf from "protobufjs";
import Long = require("long");

/** Namespace messages. */
export namespace messages {

    /** Properties of a Message. */
    interface IMessage {

        /** Message collabMessage */
        collabMessage?: (collab.ICollabMessage|null);

        /** Message notification */
        notification?: (notification.IWorkspaceNotification|null);
    }

    /** All messages send between client/server are wrapped into a `Message`. */
    class Message implements IMessage {

        /**
         * Constructs a new Message.
         * @param [properties] Properties to set
         */
        constructor(properties?: messages.IMessage);

        /** Message collabMessage. */
        public collabMessage?: (collab.ICollabMessage|null);

        /** Message notification. */
        public notification?: (notification.IWorkspaceNotification|null);

        /** Message payload. */
        public payload?: ("collabMessage"|"notification");

        /**
         * Creates a new Message instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Message instance
         */
        public static create(properties?: messages.IMessage): messages.Message;

        /**
         * Encodes the specified Message message. Does not implicitly {@link messages.Message.verify|verify} messages.
         * @param message Message message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: messages.IMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Message message, length delimited. Does not implicitly {@link messages.Message.verify|verify} messages.
         * @param message Message message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: messages.IMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Message message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Message
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): messages.Message;

        /**
         * Decodes a Message message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns Message
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): messages.Message;

        /**
         * Verifies a Message message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Message message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Message
         */
        public static fromObject(object: { [k: string]: any }): messages.Message;

        /**
         * Creates a plain object from a Message message. Also converts values to other types if specified.
         * @param message Message
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: messages.Message, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Message to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for Message
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}

/** Namespace collab. */
export namespace collab {

    /** Properties of a Rid. */
    interface IRid {

        /** Rid timestamp */
        timestamp?: (number|Long|null);

        /** Rid counter */
        counter?: (number|null);
    }

    /**
     * Rid represents Redis stream message Id, which is a unique identifier
     * in scope of individual Redis stream - here workspace scope - assigned
     * to each update stored in Redis.
     *
     * Default: "0-0"
     */
    class Rid implements IRid {

        /**
         * Constructs a new Rid.
         * @param [properties] Properties to set
         */
        constructor(properties?: collab.IRid);

        /** Rid timestamp. */
        public timestamp: (number|Long);

        /** Rid counter. */
        public counter: number;

        /**
         * Creates a new Rid instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Rid instance
         */
        public static create(properties?: collab.IRid): collab.Rid;

        /**
         * Encodes the specified Rid message. Does not implicitly {@link collab.Rid.verify|verify} messages.
         * @param message Rid message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: collab.IRid, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Rid message, length delimited. Does not implicitly {@link collab.Rid.verify|verify} messages.
         * @param message Rid message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: collab.IRid, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Rid message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Rid
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): collab.Rid;

        /**
         * Decodes a Rid message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns Rid
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): collab.Rid;

        /**
         * Verifies a Rid message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Rid message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Rid
         */
        public static fromObject(object: { [k: string]: any }): collab.Rid;

        /**
         * Creates a plain object from a Rid message. Also converts values to other types if specified.
         * @param message Rid
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: collab.Rid, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Rid to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for Rid
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SyncRequest. */
    interface ISyncRequest {

        /** SyncRequest lastMessageId */
        lastMessageId?: (collab.IRid|null);

        /** SyncRequest stateVector */
        stateVector?: (Uint8Array|null);
    }

    /**
     * SyncRequest message is send by either a server or a client, which informs about the
     * last collab state known to either party.
     *
     * If other side has more recent data, it should send `Update` message in the response.
     * If other side has missing data, it should send its own `SyncRequest` in the response.
     */
    class SyncRequest implements ISyncRequest {

        /**
         * Constructs a new SyncRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: collab.ISyncRequest);

        /** SyncRequest lastMessageId. */
        public lastMessageId?: (collab.IRid|null);

        /** SyncRequest stateVector. */
        public stateVector: Uint8Array;

        /**
         * Creates a new SyncRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SyncRequest instance
         */
        public static create(properties?: collab.ISyncRequest): collab.SyncRequest;

        /**
         * Encodes the specified SyncRequest message. Does not implicitly {@link collab.SyncRequest.verify|verify} messages.
         * @param message SyncRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: collab.ISyncRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SyncRequest message, length delimited. Does not implicitly {@link collab.SyncRequest.verify|verify} messages.
         * @param message SyncRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: collab.ISyncRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SyncRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SyncRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): collab.SyncRequest;

        /**
         * Decodes a SyncRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns SyncRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): collab.SyncRequest;

        /**
         * Verifies a SyncRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a SyncRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SyncRequest
         */
        public static fromObject(object: { [k: string]: any }): collab.SyncRequest;

        /**
         * Creates a plain object from a SyncRequest message. Also converts values to other types if specified.
         * @param message SyncRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: collab.SyncRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this SyncRequest to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for SyncRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an Update. */
    interface IUpdate {

        /** Update messageId */
        messageId?: (collab.IRid|null);

        /** Update flags */
        flags?: (number|null);

        /** Update payload */
        payload?: (Uint8Array|null);
    }

    /**
     * Update message is send either in response to `SyncRequest` or independently by
     * the client/server. It contains the Yjs doc update that can represent incremental
     * changes made over corresponding collab, or full document state.
     */
    class Update implements IUpdate {

        /**
         * Constructs a new Update.
         * @param [properties] Properties to set
         */
        constructor(properties?: collab.IUpdate);

        /** Update messageId. */
        public messageId?: (collab.IRid|null);

        /** Update flags. */
        public flags: number;

        /** Update payload. */
        public payload: Uint8Array;

        /**
         * Creates a new Update instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Update instance
         */
        public static create(properties?: collab.IUpdate): collab.Update;

        /**
         * Encodes the specified Update message. Does not implicitly {@link collab.Update.verify|verify} messages.
         * @param message Update message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: collab.IUpdate, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Update message, length delimited. Does not implicitly {@link collab.Update.verify|verify} messages.
         * @param message Update message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: collab.IUpdate, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an Update message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Update
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): collab.Update;

        /**
         * Decodes an Update message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns Update
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): collab.Update;

        /**
         * Verifies an Update message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an Update message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Update
         */
        public static fromObject(object: { [k: string]: any }): collab.Update;

        /**
         * Creates a plain object from an Update message. Also converts values to other types if specified.
         * @param message Update
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: collab.Update, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Update to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for Update
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an AwarenessUpdate. */
    interface IAwarenessUpdate {

        /** AwarenessUpdate payload */
        payload?: (Uint8Array|null);
    }

    /**
     * AwarenessUpdate message is send to inform about the latest changes in the
     * Yjs doc awareness state.
     */
    class AwarenessUpdate implements IAwarenessUpdate {

        /**
         * Constructs a new AwarenessUpdate.
         * @param [properties] Properties to set
         */
        constructor(properties?: collab.IAwarenessUpdate);

        /** AwarenessUpdate payload. */
        public payload: Uint8Array;

        /**
         * Creates a new AwarenessUpdate instance using the specified properties.
         * @param [properties] Properties to set
         * @returns AwarenessUpdate instance
         */
        public static create(properties?: collab.IAwarenessUpdate): collab.AwarenessUpdate;

        /**
         * Encodes the specified AwarenessUpdate message. Does not implicitly {@link collab.AwarenessUpdate.verify|verify} messages.
         * @param message AwarenessUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: collab.IAwarenessUpdate, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified AwarenessUpdate message, length delimited. Does not implicitly {@link collab.AwarenessUpdate.verify|verify} messages.
         * @param message AwarenessUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: collab.IAwarenessUpdate, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an AwarenessUpdate message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns AwarenessUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): collab.AwarenessUpdate;

        /**
         * Decodes an AwarenessUpdate message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns AwarenessUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): collab.AwarenessUpdate;

        /**
         * Verifies an AwarenessUpdate message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an AwarenessUpdate message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns AwarenessUpdate
         */
        public static fromObject(object: { [k: string]: any }): collab.AwarenessUpdate;

        /**
         * Creates a plain object from an AwarenessUpdate message. Also converts values to other types if specified.
         * @param message AwarenessUpdate
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: collab.AwarenessUpdate, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this AwarenessUpdate to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for AwarenessUpdate
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an AccessChanged. */
    interface IAccessChanged {

        /** AccessChanged canRead */
        canRead?: (boolean|null);

        /** AccessChanged canWrite */
        canWrite?: (boolean|null);

        /** AccessChanged reason */
        reason?: (number|null);
    }

    /**
     * AccessChanged message is sent only by the server when we recognise, that
     * connected client has lost the access to a corresponding collab.
     */
    class AccessChanged implements IAccessChanged {

        /**
         * Constructs a new AccessChanged.
         * @param [properties] Properties to set
         */
        constructor(properties?: collab.IAccessChanged);

        /** AccessChanged canRead. */
        public canRead: boolean;

        /** AccessChanged canWrite. */
        public canWrite: boolean;

        /** AccessChanged reason. */
        public reason: number;

        /**
         * Creates a new AccessChanged instance using the specified properties.
         * @param [properties] Properties to set
         * @returns AccessChanged instance
         */
        public static create(properties?: collab.IAccessChanged): collab.AccessChanged;

        /**
         * Encodes the specified AccessChanged message. Does not implicitly {@link collab.AccessChanged.verify|verify} messages.
         * @param message AccessChanged message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: collab.IAccessChanged, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified AccessChanged message, length delimited. Does not implicitly {@link collab.AccessChanged.verify|verify} messages.
         * @param message AccessChanged message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: collab.IAccessChanged, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an AccessChanged message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns AccessChanged
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): collab.AccessChanged;

        /**
         * Decodes an AccessChanged message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns AccessChanged
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): collab.AccessChanged;

        /**
         * Verifies an AccessChanged message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an AccessChanged message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns AccessChanged
         */
        public static fromObject(object: { [k: string]: any }): collab.AccessChanged;

        /**
         * Creates a plain object from an AccessChanged message. Also converts values to other types if specified.
         * @param message AccessChanged
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: collab.AccessChanged, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this AccessChanged to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for AccessChanged
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a CollabMessage. */
    interface ICollabMessage {

        /** CollabMessage objectId */
        objectId?: (string|null);

        /** CollabMessage collabType */
        collabType?: (number|null);

        /** CollabMessage syncRequest */
        syncRequest?: (collab.ISyncRequest|null);

        /** CollabMessage update */
        update?: (collab.IUpdate|null);

        /** CollabMessage awarenessUpdate */
        awarenessUpdate?: (collab.IAwarenessUpdate|null);

        /** CollabMessage accessChanged */
        accessChanged?: (collab.IAccessChanged|null);
    }

    /** Represents a CollabMessage. */
    class CollabMessage implements ICollabMessage {

        /**
         * Constructs a new CollabMessage.
         * @param [properties] Properties to set
         */
        constructor(properties?: collab.ICollabMessage);

        /** CollabMessage objectId. */
        public objectId: string;

        /** CollabMessage collabType. */
        public collabType: number;

        /** CollabMessage syncRequest. */
        public syncRequest?: (collab.ISyncRequest|null);

        /** CollabMessage update. */
        public update?: (collab.IUpdate|null);

        /** CollabMessage awarenessUpdate. */
        public awarenessUpdate?: (collab.IAwarenessUpdate|null);

        /** CollabMessage accessChanged. */
        public accessChanged?: (collab.IAccessChanged|null);

        /** CollabMessage data. */
        public data?: ("syncRequest"|"update"|"awarenessUpdate"|"accessChanged");

        /**
         * Creates a new CollabMessage instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CollabMessage instance
         */
        public static create(properties?: collab.ICollabMessage): collab.CollabMessage;

        /**
         * Encodes the specified CollabMessage message. Does not implicitly {@link collab.CollabMessage.verify|verify} messages.
         * @param message CollabMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: collab.ICollabMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CollabMessage message, length delimited. Does not implicitly {@link collab.CollabMessage.verify|verify} messages.
         * @param message CollabMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: collab.ICollabMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CollabMessage message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns CollabMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): collab.CollabMessage;

        /**
         * Decodes a CollabMessage message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns CollabMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): collab.CollabMessage;

        /**
         * Verifies a CollabMessage message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CollabMessage message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CollabMessage
         */
        public static fromObject(object: { [k: string]: any }): collab.CollabMessage;

        /**
         * Creates a plain object from a CollabMessage message. Also converts values to other types if specified.
         * @param message CollabMessage
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: collab.CollabMessage, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CollabMessage to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for CollabMessage
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}

/** Namespace notification. */
export namespace notification {

    /** Properties of a WorkspaceNotification. */
    interface IWorkspaceNotification {

        /** WorkspaceNotification profileChange */
        profileChange?: (notification.IUserProfileChange|null);

        /** WorkspaceNotification permissionChanged */
        permissionChanged?: (notification.IPermissionChanged|null);
    }

    /** Represents a WorkspaceNotification. */
    class WorkspaceNotification implements IWorkspaceNotification {

        /**
         * Constructs a new WorkspaceNotification.
         * @param [properties] Properties to set
         */
        constructor(properties?: notification.IWorkspaceNotification);

        /** WorkspaceNotification profileChange. */
        public profileChange?: (notification.IUserProfileChange|null);

        /** WorkspaceNotification permissionChanged. */
        public permissionChanged?: (notification.IPermissionChanged|null);

        /** WorkspaceNotification payload. */
        public payload?: ("profileChange"|"permissionChanged");

        /**
         * Creates a new WorkspaceNotification instance using the specified properties.
         * @param [properties] Properties to set
         * @returns WorkspaceNotification instance
         */
        public static create(properties?: notification.IWorkspaceNotification): notification.WorkspaceNotification;

        /**
         * Encodes the specified WorkspaceNotification message. Does not implicitly {@link notification.WorkspaceNotification.verify|verify} messages.
         * @param message WorkspaceNotification message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: notification.IWorkspaceNotification, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified WorkspaceNotification message, length delimited. Does not implicitly {@link notification.WorkspaceNotification.verify|verify} messages.
         * @param message WorkspaceNotification message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: notification.IWorkspaceNotification, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a WorkspaceNotification message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns WorkspaceNotification
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): notification.WorkspaceNotification;

        /**
         * Decodes a WorkspaceNotification message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns WorkspaceNotification
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): notification.WorkspaceNotification;

        /**
         * Verifies a WorkspaceNotification message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a WorkspaceNotification message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns WorkspaceNotification
         */
        public static fromObject(object: { [k: string]: any }): notification.WorkspaceNotification;

        /**
         * Creates a plain object from a WorkspaceNotification message. Also converts values to other types if specified.
         * @param message WorkspaceNotification
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: notification.WorkspaceNotification, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this WorkspaceNotification to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for WorkspaceNotification
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a UserProfileChange. */
    interface IUserProfileChange {

        /** UserProfileChange uid */
        uid?: (number|Long|null);

        /** UserProfileChange name */
        name?: (string|null);

        /** UserProfileChange email */
        email?: (string|null);
    }

    /** Represents a UserProfileChange. */
    class UserProfileChange implements IUserProfileChange {

        /**
         * Constructs a new UserProfileChange.
         * @param [properties] Properties to set
         */
        constructor(properties?: notification.IUserProfileChange);

        /** UserProfileChange uid. */
        public uid: (number|Long);

        /** UserProfileChange name. */
        public name?: (string|null);

        /** UserProfileChange email. */
        public email?: (string|null);

        /** UserProfileChange _name. */
        public _name?: "name";

        /** UserProfileChange _email. */
        public _email?: "email";

        /**
         * Creates a new UserProfileChange instance using the specified properties.
         * @param [properties] Properties to set
         * @returns UserProfileChange instance
         */
        public static create(properties?: notification.IUserProfileChange): notification.UserProfileChange;

        /**
         * Encodes the specified UserProfileChange message. Does not implicitly {@link notification.UserProfileChange.verify|verify} messages.
         * @param message UserProfileChange message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: notification.IUserProfileChange, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified UserProfileChange message, length delimited. Does not implicitly {@link notification.UserProfileChange.verify|verify} messages.
         * @param message UserProfileChange message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: notification.IUserProfileChange, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a UserProfileChange message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns UserProfileChange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): notification.UserProfileChange;

        /**
         * Decodes a UserProfileChange message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns UserProfileChange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): notification.UserProfileChange;

        /**
         * Verifies a UserProfileChange message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a UserProfileChange message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns UserProfileChange
         */
        public static fromObject(object: { [k: string]: any }): notification.UserProfileChange;

        /**
         * Creates a plain object from a UserProfileChange message. Also converts values to other types if specified.
         * @param message UserProfileChange
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: notification.UserProfileChange, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this UserProfileChange to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for UserProfileChange
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a PermissionChanged. */
    interface IPermissionChanged {

        /** PermissionChanged objectId */
        objectId?: (string|null);

        /** PermissionChanged reason */
        reason?: (number|null);
    }

    /** Represents a PermissionChanged. */
    class PermissionChanged implements IPermissionChanged {

        /**
         * Constructs a new PermissionChanged.
         * @param [properties] Properties to set
         */
        constructor(properties?: notification.IPermissionChanged);

        /** PermissionChanged objectId. */
        public objectId: string;

        /** PermissionChanged reason. */
        public reason: number;

        /**
         * Creates a new PermissionChanged instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PermissionChanged instance
         */
        public static create(properties?: notification.IPermissionChanged): notification.PermissionChanged;

        /**
         * Encodes the specified PermissionChanged message. Does not implicitly {@link notification.PermissionChanged.verify|verify} messages.
         * @param message PermissionChanged message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: notification.IPermissionChanged, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PermissionChanged message, length delimited. Does not implicitly {@link notification.PermissionChanged.verify|verify} messages.
         * @param message PermissionChanged message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: notification.IPermissionChanged, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PermissionChanged message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PermissionChanged
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): notification.PermissionChanged;

        /**
         * Decodes a PermissionChanged message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns PermissionChanged
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): notification.PermissionChanged;

        /**
         * Verifies a PermissionChanged message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PermissionChanged message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PermissionChanged
         */
        public static fromObject(object: { [k: string]: any }): notification.PermissionChanged;

        /**
         * Creates a plain object from a PermissionChanged message. Also converts values to other types if specified.
         * @param message PermissionChanged
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: notification.PermissionChanged, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PermissionChanged to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for PermissionChanged
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}
