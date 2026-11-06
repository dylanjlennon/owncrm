// Generated from contract/schema/*.schema.json by `npm run contract:schemas`. Do not edit by hand.
// A test checks that this file and the JSON files say the same thing.
export const SCHEMAS = {
  "consent": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://owncrm.example/contract/1/consent.schema.json",
    "title": "consent",
    "description": "Consent claims. The importer keeps opt-outs and treats every opt-in as unknown until you confirm it in the app.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "household_id",
      "status",
      "source"
    ],
    "properties": {
      "household_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
      },
      "person_id": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
      },
      "status": {
        "type": "string",
        "enum": [
          "unknown",
          "opted_in",
          "opted_out"
        ]
      },
      "source": {
        "type": "string",
        "maxLength": 300,
        "minLength": 1
      },
      "recorded_on": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "wording": {
        "type": [
          "string",
          "null"
        ],
        "maxLength": 1000
      }
    }
  },
  "contact_methods": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://owncrm.example/contract/1/contact_methods.schema.json",
    "title": "contact_methods",
    "description": "Emails and phone numbers.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "household_id",
      "kind",
      "value"
    ],
    "properties": {
      "household_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
      },
      "person_id": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
      },
      "kind": {
        "type": "string",
        "enum": [
          "email",
          "phone"
        ]
      },
      "value": {
        "type": "string",
        "maxLength": 320,
        "minLength": 3
      }
    }
  },
  "deals": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://owncrm.example/contract/1/deals.schema.json",
    "title": "deals",
    "description": "Deals from your own records. Your firm's file stays the official record.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "deal_id",
      "household_id",
      "side",
      "status"
    ],
    "properties": {
      "deal_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
      },
      "household_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
      },
      "side": {
        "type": "string",
        "enum": [
          "buyer",
          "seller"
        ]
      },
      "status": {
        "type": "string",
        "enum": [
          "prospect",
          "active",
          "under contract",
          "closed",
          "dead"
        ]
      },
      "property_street": {
        "type": [
          "string",
          "null"
        ],
        "maxLength": 200
      },
      "closing_date": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "net_to_me": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^-?\\d{1,10}(\\.\\d{1,2})?$"
      }
    }
  },
  "households": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://owncrm.example/contract/1/households.schema.json",
    "title": "households",
    "description": "One row per relationship (a couple, co-buyers, one person). summary is a short AI or human summary, never message text.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "household_id",
      "display_name",
      "stage",
      "source_type"
    ],
    "properties": {
      "household_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
      },
      "display_name": {
        "type": "string",
        "maxLength": 200,
        "minLength": 1
      },
      "stage": {
        "type": "string",
        "enum": [
          "new lead",
          "active buyer",
          "active seller",
          "under contract",
          "past client",
          "sphere",
          "nurture",
          "cold lead",
          "do not contact"
        ]
      },
      "lead_source": {
        "type": [
          "string",
          "null"
        ],
        "maxLength": 200
      },
      "source_type": {
        "type": "string",
        "enum": [
          "personal",
          "firm_provided",
          "portal",
          "unknown"
        ]
      },
      "first_contact_on": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "last_contact_on": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "summary": {
        "type": [
          "string",
          "null"
        ],
        "maxLength": 280
      },
      "suggested_next_step": {
        "type": [
          "string",
          "null"
        ],
        "maxLength": 200
      },
      "suggested_next_step_on": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "why": {
        "type": [
          "string",
          "null"
        ],
        "maxLength": 300
      }
    }
  },
  "interactions": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://owncrm.example/contract/1/interactions.schema.json",
    "title": "interactions",
    "description": "Summaries only. Never paste message text here.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "household_id",
      "kind",
      "occurred_on"
    ],
    "properties": {
      "household_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
      },
      "kind": {
        "type": "string",
        "enum": [
          "call",
          "text",
          "email",
          "meeting",
          "showing",
          "note"
        ]
      },
      "occurred_on": {
        "type": "string",
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "summary": {
        "type": [
          "string",
          "null"
        ],
        "maxLength": 400
      }
    }
  },
  "manifest": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://owncrm.example/contract/1/manifest.schema.json",
    "title": "manifest",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "contract_version",
      "created_at"
    ],
    "properties": {
      "contract_version": {
        "type": "string",
        "pattern": "^1\\.\\d+\\.\\d+$"
      },
      "created_at": {
        "type": "string",
        "maxLength": 40
      },
      "created_by": {
        "type": "string",
        "maxLength": 100
      },
      "sources": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "gmail",
            "outlook",
            "imessage",
            "google_voice",
            "phone_contacts",
            "android_sms",
            "crm_export",
            "deal_records",
            "website_lists",
            "manual"
          ]
        },
        "maxItems": 20
      },
      "range_start": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "range_end": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "notes": {
        "type": "string",
        "maxLength": 500
      }
    }
  },
  "people": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://owncrm.example/contract/1/people.schema.json",
    "title": "people",
    "description": "People in each household.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "person_id",
      "household_id",
      "first_name"
    ],
    "properties": {
      "person_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
      },
      "household_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
      },
      "first_name": {
        "type": "string",
        "maxLength": 100,
        "minLength": 1
      },
      "last_name": {
        "type": [
          "string",
          "null"
        ],
        "maxLength": 100
      },
      "role": {
        "type": [
          "string",
          "null"
        ],
        "maxLength": 40
      }
    }
  },
  "source_evidence": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://owncrm.example/contract/1/source_evidence.schema.json",
    "title": "source_evidence",
    "description": "Where each relationship was found: dates and counts only.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "household_id",
      "source",
      "evidence_type"
    ],
    "properties": {
      "household_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
      },
      "source": {
        "type": "string",
        "enum": [
          "gmail",
          "outlook",
          "imessage",
          "google_voice",
          "phone_contacts",
          "android_sms",
          "crm_export",
          "deal_records",
          "website_lists",
          "manual"
        ]
      },
      "evidence_type": {
        "type": "string",
        "enum": [
          "email_metadata",
          "text_metadata",
          "call_log",
          "voicemail_metadata",
          "contact_card",
          "crm_export",
          "deal_record",
          "website_list"
        ]
      },
      "first_seen_on": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "last_seen_on": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "message_count": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^\\d{1,7}$"
      },
      "why": {
        "type": [
          "string",
          "null"
        ],
        "maxLength": 300
      }
    }
  },
  "suppressions": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://owncrm.example/contract/1/suppressions.schema.json",
    "title": "suppressions",
    "description": "Opt-outs. Always imported. Never removed by the app.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "kind",
      "value"
    ],
    "properties": {
      "kind": {
        "type": "string",
        "enum": [
          "email",
          "phone"
        ]
      },
      "value": {
        "type": "string",
        "maxLength": 320,
        "minLength": 3
      },
      "reason": {
        "type": [
          "string",
          "null"
        ],
        "maxLength": 200
      }
    }
  }
};
