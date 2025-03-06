import Table from "cli-table3";
import picocolors from "picocolors";
import { AdamikBalance, AdamikChain } from "../adamik/types";
import { amountToMainUnit } from "../utils";

export const displayBalance = (
  balance: AdamikBalance,
  chains: Record<string, AdamikChain>,
  chainId: string
) => {
  // Check if there are any actual unconfirmed values to display
  // const hasUnconfirmed =
  //   balance.balances.native.unconfirmed !== null &&
  //   balance.balances.native.unconfirmed !== "0" &&
  //   balance.balances.native.unconfirmed !== "-" &&
  //   balance.balances.native.unconfirmed !== "null";

  // Main balance table - headers without unconfirmed column if no actual values
  const balanceTable = new Table({
    style: { head: ["cyan"] },
    head: ["Asset", "Available", "Total", "Name"],
    chars: {
      top: "═",
      "top-mid": "╤",
      "top-left": "╔",
      "top-right": "╗",
      bottom: "═",
      "bottom-mid": "╧",
      "bottom-left": "╚",
      "bottom-right": "╝",
      left: "║",
      "left-mid": "╟",
      mid: "─",
      "mid-mid": "┼",
      right: "║",
      "right-mid": "╢",
      middle: "│",
    },
  });

  // Add native balance
  balanceTable.push([
    picocolors.bold(chains[chainId].ticker),
    picocolors.cyan(
      amountToMainUnit(
        balance.balances.native.available,
        chains[chainId].decimals
      )
    ),
    picocolors.cyan(
      amountToMainUnit(balance.balances.native.total, chains[chainId].decimals)
    ),
    picocolors.italic(chains[chainId].name),
  ]);

  // Add token balances if they exist
  if (balance.balances.tokens?.length > 0) {
    balance.balances.tokens.forEach((token) => {
      balanceTable.push([
        picocolors.bold(token.token.ticker),
        picocolors.cyan(
          amountToMainUnit(token.amount, parseInt(token.token.decimals))
        ),
        picocolors.cyan(
          amountToMainUnit(token.amount, parseInt(token.token.decimals))
        ),
        picocolors.italic(token.token.name),
      ]);
    });
  }

  console.log("\n" + picocolors.bold("Account Balances:"));
  console.log(balanceTable.toString() + "\n");

  // Show staking information if available
  if (balance.balances.staking) {
    const stakingOverviewTable = new Table({
      style: { head: ["cyan"] },
      head: ["Total Staked", "Locked", "Unlocking", "Unlocked"],
    });

    stakingOverviewTable.push([
      picocolors.cyan(
        amountToMainUnit(
          balance.balances.staking.total,
          chains[chainId].decimals
        )
      ),
      picocolors.cyan(
        amountToMainUnit(
          balance.balances.staking.locked,
          chains[chainId].decimals
        )
      ),
      picocolors.cyan(
        amountToMainUnit(
          balance.balances.staking.unlocking,
          chains[chainId].decimals
        )
      ),
      picocolors.cyan(
        amountToMainUnit(
          balance.balances.staking.unlocked,
          chains[chainId].decimals
        )
      ),
    ]);

    console.log(picocolors.bold("\nStaking Overview:"));
    console.log(stakingOverviewTable.toString());

    // Show staking positions
    if (balance.balances.staking.positions.length > 0) {
      const positionsTable = new Table({
        style: { head: ["cyan"] },
        head: ["Validator", "Amount", "Status", "Completion Date"],
      });

      balance.balances.staking.positions.forEach((pos) => {
        positionsTable.push([
          picocolors.yellow(pos.validatorAddresses[0]),
          picocolors.cyan(
            amountToMainUnit(pos.amount, chains[chainId].decimals)
          ),
          picocolors.green(pos.status),
          pos.completionDate
            ? new Date(pos.completionDate).toLocaleString()
            : "-",
        ]);
      });

      console.log(picocolors.bold("\nStaking Positions:"));
      console.log(positionsTable.toString());
    }

    // Show staking rewards
    if (
      balance.balances.staking.rewards.native.length > 0 ||
      balance.balances.staking.rewards.tokens.length > 0
    ) {
      const rewardsTable = new Table({
        style: { head: ["cyan"] },
        head: ["Type", "Validator", "Amount"],
      });

      // Native rewards
      balance.balances.staking.rewards.native.forEach((reward) => {
        rewardsTable.push([
          picocolors.bold(chains[chainId].ticker),
          picocolors.yellow(reward.validatorAddress),
          picocolors.cyan(
            amountToMainUnit(reward.amount, chains[chainId].decimals)
          ),
        ]);
      });

      // Token rewards
      balance.balances.staking.rewards.tokens.forEach((reward) => {
        rewardsTable.push([
          picocolors.bold(reward.token.ticker),
          picocolors.yellow(reward.validatorAddress),
          picocolors.cyan(
            amountToMainUnit(reward.amount, parseInt(reward.token.decimals))
          ),
        ]);
      });

      console.log(picocolors.bold("\nStaking Rewards:"));
      console.log(rewardsTable.toString() + "\n");
    }
  }
};
