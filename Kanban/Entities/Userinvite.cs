using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class Userinvite
{
    public long Id { get; set; }

    public DateTime ExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public bool IsAccepted { get; set; }

    public string Email { get; set; } = null!;

    public long BoardId { get; set; }

    public long SenderUserId { get; set; }

    public virtual Board Board { get; set; } = null!;

    public virtual User SenderUser { get; set; } = null!;
}
