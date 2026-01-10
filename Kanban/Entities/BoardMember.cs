using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class BoardMember
{
    public long BoardId { get; set; }

    public long UserId { get; set; }

    public string RoleCode { get; set; } = null!;

    public bool IsActive { get; set; }

    public virtual Board Board { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
