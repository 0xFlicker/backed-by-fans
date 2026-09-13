export const membershipInterfaces = [
  { name: "erc165", id: "0x01ffc9a7" },
  { name: "erc721", id: "0x80ac58cd" },
  { name: "erc721Metadata", id: "0x5b5e139f" },
  { name: "erc721Enumerable", id: "0x780e9d63" },
  { name: "erc5643", id: "0x8c65f84d" },
  { name: "erc4906", id: "0x49064906" },
  // Compiler-derived IMembershipTier ID: rejects obsolete immutable deployments.
  { name: "membershipPositions", id: "0xd1b6b944" },
] as const;
