export type Mmm = {
  "version": "0.1.0",
  "name": "mmm",
  "instructions": [
    {
      "name": "createPool",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "CreatePoolArgs"
          }
        }
      ]
    },
    {
      "name": "updatePool",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "UpdatePoolArgs"
          }
        }
      ]
    },
    {
      "name": "solClosePool",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "solDepositBuy",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "SolDepositBuyArgs"
          }
        }
      ]
    },
    {
      "name": "solWithdrawBuy",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "SolWithdrawBuyArgs"
          }
        }
      ]
    },
    {
      "name": "solFulfillBuy",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "referral",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "assetMetadata",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMasterEdition",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "payerAssetAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sellsideEscrowTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ownerTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "allowlistAuxAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sellState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "SolFulfillBuyArgs"
          }
        }
      ]
    },
    {
      "name": "solFulfillSell",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "referral",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "assetMetadata",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMasterEdition",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sellsideEscrowTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "payerAssetAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "allowlistAuxAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sellState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "SolFulfillSellArgs"
          }
        }
      ]
    },
    {
      "name": "withdrawSell",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "assetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sellsideEscrowTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "allowlistAuxAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sellState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "WithdrawSellArgs"
          }
        }
      ]
    },
    {
      "name": "depositSell",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "assetMetadata",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMasterEdition",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sellsideEscrowTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sellState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "allowlistAuxAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "DepositSellArgs"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "spotPrice",
            "type": "u64"
          },
          {
            "name": "curveType",
            "type": "u8"
          },
          {
            "name": "curveDelta",
            "type": "u64"
          },
          {
            "name": "reinvestFulfillBuy",
            "type": "bool"
          },
          {
            "name": "reinvestFulfillSell",
            "type": "bool"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "lpFeeBp",
            "type": "u16"
          },
          {
            "name": "referral",
            "type": "publicKey"
          },
          {
            "name": "referralBp",
            "type": "u16"
          },
          {
            "name": "buysideCreatorRoyaltyBp",
            "type": "u16"
          },
          {
            "name": "cosignerAnnotation",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "sellsideOrdersCount",
            "type": "u64"
          },
          {
            "name": "lpFeeEarned",
            "type": "u64"
          },
          {
            "name": "owner",
            "type": "publicKey"
          },
          {
            "name": "cosigner",
            "type": "publicKey"
          },
          {
            "name": "uuid",
            "type": "publicKey"
          },
          {
            "name": "paymentMint",
            "type": "publicKey"
          },
          {
            "name": "allowlists",
            "type": {
              "array": [
                {
                  "defined": "Allowlist"
                },
                6
              ]
            }
          }
        ]
      }
    },
    {
      "name": "sellState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "publicKey"
          },
          {
            "name": "poolOwner",
            "type": "publicKey"
          },
          {
            "name": "assetMint",
            "type": "publicKey"
          },
          {
            "name": "assetAmount",
            "type": "u64"
          },
          {
            "name": "cosignerAnnotation",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "CreatePoolArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "spotPrice",
            "type": "u64"
          },
          {
            "name": "curveType",
            "type": "u8"
          },
          {
            "name": "curveDelta",
            "type": "u64"
          },
          {
            "name": "reinvestFulfillBuy",
            "type": "bool"
          },
          {
            "name": "reinvestFulfillSell",
            "type": "bool"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "lpFeeBp",
            "type": "u16"
          },
          {
            "name": "referral",
            "type": "publicKey"
          },
          {
            "name": "referralBp",
            "type": "u16"
          },
          {
            "name": "cosignerAnnotation",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "buysideCreatorRoyaltyBp",
            "type": "u16"
          },
          {
            "name": "uuid",
            "type": "publicKey"
          },
          {
            "name": "paymentMint",
            "type": "publicKey"
          },
          {
            "name": "allowlists",
            "type": {
              "array": [
                {
                  "defined": "Allowlist"
                },
                6
              ]
            }
          }
        ]
      }
    },
    {
      "name": "DepositSellArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetAmount",
            "type": "u64"
          },
          {
            "name": "allowlistAux",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "SolDepositBuyArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paymentAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "SolFulfillBuyArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetAmount",
            "type": "u64"
          },
          {
            "name": "minPaymentAmount",
            "type": "u64"
          },
          {
            "name": "allowlistAux",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "SolFulfillSellArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetAmount",
            "type": "u64"
          },
          {
            "name": "maxPaymentAmount",
            "type": "u64"
          },
          {
            "name": "buysideCreatorRoyaltyBp",
            "type": "u16"
          },
          {
            "name": "allowlistAux",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "SolWithdrawBuyArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paymentAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "UpdatePoolArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "spotPrice",
            "type": "u64"
          },
          {
            "name": "curveType",
            "type": "u8"
          },
          {
            "name": "curveDelta",
            "type": "u64"
          },
          {
            "name": "reinvestFulfillBuy",
            "type": "bool"
          },
          {
            "name": "reinvestFulfillSell",
            "type": "bool"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "lpFeeBp",
            "type": "u16"
          },
          {
            "name": "referral",
            "type": "publicKey"
          },
          {
            "name": "referralBp",
            "type": "u16"
          },
          {
            "name": "cosignerAnnotation",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "buysideCreatorRoyaltyBp",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "WithdrawSellArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetAmount",
            "type": "u64"
          },
          {
            "name": "allowlistAux",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "Allowlist",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "value",
            "type": "publicKey"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidLPFee",
      "msg": "lp fee bp must be between 0 and 10000"
    },
    {
      "code": 6001,
      "name": "InvalidAllowLists",
      "msg": "invalid allowlists"
    },
    {
      "code": 6002,
      "name": "InvalidBP",
      "msg": "invalid bp"
    },
    {
      "code": 6003,
      "name": "InvalidCurveType",
      "msg": "invalid curve type"
    },
    {
      "code": 6004,
      "name": "InvalidCurveDelta",
      "msg": "invalid curve delta"
    },
    {
      "code": 6005,
      "name": "InvalidCosigner",
      "msg": "invalid cosigner"
    },
    {
      "code": 6006,
      "name": "InvalidPaymentMint",
      "msg": "invalid payment mint"
    },
    {
      "code": 6007,
      "name": "InvalidOwner",
      "msg": "invalid owner"
    },
    {
      "code": 6008,
      "name": "NumericOverflow",
      "msg": "numeric overflow"
    },
    {
      "code": 6009,
      "name": "InvalidRequestedPrice",
      "msg": "invalid requested price"
    },
    {
      "code": 6010,
      "name": "NotEmptyEscrowAccount",
      "msg": "not empty escrow account"
    },
    {
      "code": 6011,
      "name": "NotEmptySellSideOrdersCount",
      "msg": "not empty sell side orders count"
    },
    {
      "code": 6012,
      "name": "InvalidReferral",
      "msg": "invalid referral"
    },
    {
      "code": 6013,
      "name": "InvalidMasterEdition",
      "msg": "invalid master edition"
    },
    {
      "code": 6014,
      "name": "Expired",
      "msg": "expired"
    },
    {
      "code": 6015,
      "name": "InvalidCreatorAddress",
      "msg": "invalid creator address"
    },
    {
      "code": 6016,
      "name": "NotEnoughBalance",
      "msg": "not enough balance"
    },
    {
      "code": 6017,
      "name": "InvalidTokenOwner",
      "msg": "invalid token owner"
    },
    {
      "code": 6018,
      "name": "PubkeyMismatch",
      "msg": "pubkey mismatch"
    },
    {
      "code": 6019,
      "name": "UninitializedAccount",
      "msg": "uninitialized account"
    }
  ]
};

export const IDL: Mmm = {
  "version": "0.1.0",
  "name": "mmm",
  "instructions": [
    {
      "name": "createPool",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "CreatePoolArgs"
          }
        }
      ]
    },
    {
      "name": "updatePool",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "UpdatePoolArgs"
          }
        }
      ]
    },
    {
      "name": "solClosePool",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "solDepositBuy",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "SolDepositBuyArgs"
          }
        }
      ]
    },
    {
      "name": "solWithdrawBuy",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "SolWithdrawBuyArgs"
          }
        }
      ]
    },
    {
      "name": "solFulfillBuy",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "referral",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "assetMetadata",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMasterEdition",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "payerAssetAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sellsideEscrowTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ownerTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "allowlistAuxAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sellState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "SolFulfillBuyArgs"
          }
        }
      ]
    },
    {
      "name": "solFulfillSell",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "referral",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "assetMetadata",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMasterEdition",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sellsideEscrowTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "payerAssetAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "allowlistAuxAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sellState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "SolFulfillSellArgs"
          }
        }
      ]
    },
    {
      "name": "withdrawSell",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "assetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sellsideEscrowTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "buysideSolEscrowAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "allowlistAuxAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sellState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "WithdrawSellArgs"
          }
        }
      ]
    },
    {
      "name": "depositSell",
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "cosigner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "pool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "assetMetadata",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMasterEdition",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "assetTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sellsideEscrowTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sellState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "allowlistAuxAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "DepositSellArgs"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "spotPrice",
            "type": "u64"
          },
          {
            "name": "curveType",
            "type": "u8"
          },
          {
            "name": "curveDelta",
            "type": "u64"
          },
          {
            "name": "reinvestFulfillBuy",
            "type": "bool"
          },
          {
            "name": "reinvestFulfillSell",
            "type": "bool"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "lpFeeBp",
            "type": "u16"
          },
          {
            "name": "referral",
            "type": "publicKey"
          },
          {
            "name": "referralBp",
            "type": "u16"
          },
          {
            "name": "buysideCreatorRoyaltyBp",
            "type": "u16"
          },
          {
            "name": "cosignerAnnotation",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "sellsideOrdersCount",
            "type": "u64"
          },
          {
            "name": "lpFeeEarned",
            "type": "u64"
          },
          {
            "name": "owner",
            "type": "publicKey"
          },
          {
            "name": "cosigner",
            "type": "publicKey"
          },
          {
            "name": "uuid",
            "type": "publicKey"
          },
          {
            "name": "paymentMint",
            "type": "publicKey"
          },
          {
            "name": "allowlists",
            "type": {
              "array": [
                {
                  "defined": "Allowlist"
                },
                6
              ]
            }
          }
        ]
      }
    },
    {
      "name": "sellState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "publicKey"
          },
          {
            "name": "poolOwner",
            "type": "publicKey"
          },
          {
            "name": "assetMint",
            "type": "publicKey"
          },
          {
            "name": "assetAmount",
            "type": "u64"
          },
          {
            "name": "cosignerAnnotation",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "CreatePoolArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "spotPrice",
            "type": "u64"
          },
          {
            "name": "curveType",
            "type": "u8"
          },
          {
            "name": "curveDelta",
            "type": "u64"
          },
          {
            "name": "reinvestFulfillBuy",
            "type": "bool"
          },
          {
            "name": "reinvestFulfillSell",
            "type": "bool"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "lpFeeBp",
            "type": "u16"
          },
          {
            "name": "referral",
            "type": "publicKey"
          },
          {
            "name": "referralBp",
            "type": "u16"
          },
          {
            "name": "cosignerAnnotation",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "buysideCreatorRoyaltyBp",
            "type": "u16"
          },
          {
            "name": "uuid",
            "type": "publicKey"
          },
          {
            "name": "paymentMint",
            "type": "publicKey"
          },
          {
            "name": "allowlists",
            "type": {
              "array": [
                {
                  "defined": "Allowlist"
                },
                6
              ]
            }
          }
        ]
      }
    },
    {
      "name": "DepositSellArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetAmount",
            "type": "u64"
          },
          {
            "name": "allowlistAux",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "SolDepositBuyArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paymentAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "SolFulfillBuyArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetAmount",
            "type": "u64"
          },
          {
            "name": "minPaymentAmount",
            "type": "u64"
          },
          {
            "name": "allowlistAux",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "SolFulfillSellArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetAmount",
            "type": "u64"
          },
          {
            "name": "maxPaymentAmount",
            "type": "u64"
          },
          {
            "name": "buysideCreatorRoyaltyBp",
            "type": "u16"
          },
          {
            "name": "allowlistAux",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "SolWithdrawBuyArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paymentAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "UpdatePoolArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "spotPrice",
            "type": "u64"
          },
          {
            "name": "curveType",
            "type": "u8"
          },
          {
            "name": "curveDelta",
            "type": "u64"
          },
          {
            "name": "reinvestFulfillBuy",
            "type": "bool"
          },
          {
            "name": "reinvestFulfillSell",
            "type": "bool"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "lpFeeBp",
            "type": "u16"
          },
          {
            "name": "referral",
            "type": "publicKey"
          },
          {
            "name": "referralBp",
            "type": "u16"
          },
          {
            "name": "cosignerAnnotation",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "buysideCreatorRoyaltyBp",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "WithdrawSellArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetAmount",
            "type": "u64"
          },
          {
            "name": "allowlistAux",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "Allowlist",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "value",
            "type": "publicKey"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidLPFee",
      "msg": "lp fee bp must be between 0 and 10000"
    },
    {
      "code": 6001,
      "name": "InvalidAllowLists",
      "msg": "invalid allowlists"
    },
    {
      "code": 6002,
      "name": "InvalidBP",
      "msg": "invalid bp"
    },
    {
      "code": 6003,
      "name": "InvalidCurveType",
      "msg": "invalid curve type"
    },
    {
      "code": 6004,
      "name": "InvalidCurveDelta",
      "msg": "invalid curve delta"
    },
    {
      "code": 6005,
      "name": "InvalidCosigner",
      "msg": "invalid cosigner"
    },
    {
      "code": 6006,
      "name": "InvalidPaymentMint",
      "msg": "invalid payment mint"
    },
    {
      "code": 6007,
      "name": "InvalidOwner",
      "msg": "invalid owner"
    },
    {
      "code": 6008,
      "name": "NumericOverflow",
      "msg": "numeric overflow"
    },
    {
      "code": 6009,
      "name": "InvalidRequestedPrice",
      "msg": "invalid requested price"
    },
    {
      "code": 6010,
      "name": "NotEmptyEscrowAccount",
      "msg": "not empty escrow account"
    },
    {
      "code": 6011,
      "name": "NotEmptySellSideOrdersCount",
      "msg": "not empty sell side orders count"
    },
    {
      "code": 6012,
      "name": "InvalidReferral",
      "msg": "invalid referral"
    },
    {
      "code": 6013,
      "name": "InvalidMasterEdition",
      "msg": "invalid master edition"
    },
    {
      "code": 6014,
      "name": "Expired",
      "msg": "expired"
    },
    {
      "code": 6015,
      "name": "InvalidCreatorAddress",
      "msg": "invalid creator address"
    },
    {
      "code": 6016,
      "name": "NotEnoughBalance",
      "msg": "not enough balance"
    },
    {
      "code": 6017,
      "name": "InvalidTokenOwner",
      "msg": "invalid token owner"
    },
    {
      "code": 6018,
      "name": "PubkeyMismatch",
      "msg": "pubkey mismatch"
    },
    {
      "code": 6019,
      "name": "UninitializedAccount",
      "msg": "uninitialized account"
    }
  ]
};
